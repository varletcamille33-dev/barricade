
// victory-patch.js — overlay de victoire non-invasif
(function(){
  if (typeof window === "undefined") return;

  // Essayons de récupérer des globals
  const g = window;
  const NODES = g.NODES || [];
  if (!Array.isArray(NODES) || NODES.length === 0) return; // rien à faire si pas chargé

  const TOP_GOAL_ID = NODES.reduce((best, n)=> (n.y < best.y ? n : best), NODES[0]).id;

  // Hook minimal : patcher transactMove si présent, sinon on comptera sur le serveur déjà en place
  const _transactMove = g.transactMove;
  if (typeof _transactMove === "function") {
    g.transactMove = function(st, pawnIndex, from, to){
      return g.runTransaction(g.gameRef, (cur)=>{
        cur = g.ensure(cur);
        if(cur.order[cur.turnIndex]!==g.ME) return cur;
        if(cur._mustPlaceBarricade) return cur;
        if(!cur.dice || cur.dice===0) return cur;

        const me = cur.players[g.ME];
        if(!me) return cur;
        const pawn = me.pawns[pawnIndex];
        if(!pawn) return cur;

        // Vérifs basiques
        const occ = g.occSet(cur.players);
        const barrSet = new Set(cur.barricades||[]);

        // On applique le move (copie simplifiée de ton transactMove natif)
        if(from==="home"){
          pawn.atHome = false;
          pawn.pos = to;
        } else {
          pawn.atHome = false;
          pawn.pos = to;
        }

        // Si on atteint le sommet : winner
        if(to === TOP_GOAL_ID && !cur.winner){
          cur.winner = g.ME;
        }

        // Barricade capturée -> phase de placement
        if(barrSet.has(to)){
          cur.barricades = (cur.barricades||[]).filter(id=>id!==to);
          cur._mustPlaceBarricade = true;
          cur._placer = g.ME;
        } else {
          cur.dice = 0;
          cur.turnIndex = (cur.turnIndex + 1) % cur.order.length;
        }
        return cur;
      });
    };
  }

  // Overlay dynamique
  function showVictory(st){
    if(!st || !st.started || !st.winner) return;
    let v = document.getElementById('victory_overlay');
    if (v) v.remove();

    v = document.createElement('div');
    v.id = 'victory_overlay';
    Object.assign(v.style, {
      position:'fixed', inset:'0', background:'rgba(0,0,0,0.35)',
      backdropFilter: 'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:'9999'
    });
    const card = document.createElement('div');
    Object.assign(card.style, {
      background:'#fff', borderRadius:'16px', padding:'24px', width:'min(520px,92vw)',
      textAlign:'center', boxShadow:'0 10px 30px rgba(0,0,0,.2)'
    });
    v.appendChild(card);

    const title = document.createElement('h2');
    const wName = st.winner;
    const color = (st.players[wName] && st.players[wName].color) || "";
    title.textContent = `Victoire de ${wName}${color? " ("+color+")" : ""}`;
    title.style.margin = '0 0 8px 0';
    title.style.fontSize = '28px';
    card.appendChild(title);

    const sub = document.createElement('div');
    sub.textContent = "Si Camille a gagné, c'est normal elle a super bien joué. Si elle a perdu, c'est uniquement que vous avez eu beaucoup de chance";
    sub.style.color = '#555';
    sub.style.fontSize = '14px';
    sub.style.marginBottom = '18px';
    card.appendChild(sub);

    const btns = document.createElement('div');
    Object.assign(btns.style, { display:'flex', gap:'10px', justifyContent:'center' });
    card.appendChild(btns);

    const replay = document.createElement('button');
    replay.textContent = 'Rejouer';
    replay.className = 'primary';
    replay.onclick = async ()=>{
      await g.runTransaction(g.gameRef, (cur)=>{
        cur = g.ensure(cur);
        if(!cur.started) return cur;
        for(const [name, pl] of Object.entries(cur.players||{})){
          pl.pawns = Array.from({length:5}).map(()=>({pos:"home",atHome:true}));
          pl.won = false;
        }
        cur.turnIndex = 0;
        cur.dice = 0;
        cur.winner = "";
        cur.barricades = [...g.BARRS];
        cur._mustPlaceBarricade = false;
        cur._placer = "";
        cur.started = true;
        return cur;
      });
      v.remove();
    };
    btns.appendChild(replay);

    const home = document.createElement('button');
    home.textContent = 'Accueil';
    home.onclick = ()=>{
      const join = document.getElementById('join');
      const lobby = document.getElementById('lobby');
      if (join) join.style.display = 'block';
      if (lobby) lobby.style.display = 'none';
      v.remove();
    };
    btns.appendChild(home);

    document.body.appendChild(v);
  }

  // Ecoute douce : on surveille le state global déjà rendu par subscribe() via RST sur window si exposé
  const _subscribe = g.subscribe;
  if (typeof _subscribe === "function") {
    g.subscribe = function(id){
      _subscribe.call(this, id);
      // Attache un petit observer de micro-tâche pour checker RST après chaque snapshot (si exposé globalement)
      const origRender = g.enableTurn;
      if (typeof origRender === "function") {
        g.enableTurn = function(st){
          origRender.call(this, st);
          try{ if(st && st.started && st.winner) showVictory(st); }catch(e){}
        };
      }
    };
  }
})();
