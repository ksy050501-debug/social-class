/* =========================================================
 * 시연 모드 저장소: 이 기기의 브라우저(localStorage)에만 저장합니다.
 * 같은 브라우저의 다른 탭과는 상태가 함께 바뀝니다.
 * ========================================================= */
(function (root) {
  'use strict';
  const L = root.TradeLogic;
  const KEY_S = 'tradeGame.state.v1', KEY_C = 'tradeGame.cfg.v1';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  function createLocalBackend(onChange) {
    let cfg = (() => { try { const c = JSON.parse(get(KEY_C)); if (c && c.items && c.countries) return c; } catch (e) {} return L.clone(L.DEFAULT_CONFIG); })();
    let S = (() => { try { const s = JSON.parse(get(KEY_S)); if (s && s.countries) return s; } catch (e) {} return L.createState(cfg); })();
    const save = () => { set(KEY_S, JSON.stringify(S)); set(KEY_C, JSON.stringify(cfg)); };
    const emit = () => onChange(S, cfg, { online: true });
    const done = (r) => { save(); emit(); return Promise.resolve(r); };
    const opId = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    window.addEventListener('storage', (e) => {
      if (e.key !== KEY_S && e.key !== KEY_C) return;
      try { if (e.key === KEY_S && e.newValue) S = JSON.parse(e.newValue); if (e.key === KEY_C && e.newValue) cfg = JSON.parse(e.newValue); } catch (err) { return; }
      emit();
    });

    const api = {
      start() { emit(); },
      produce: (cid, item) => done(L.produce(S, cfg, cid, item, opId())),
      undo: (cid) => done(L.undoProduce(S, cfg, cid)),
      propose: (cid, to, give, get) => done(L.proposeTrade(S, cfg, cid, to, give, get, opId())),
      accept: (cid, tid) => done(L.acceptTrade(S, cfg, tid, cid)),
      reject: (cid, tid) => done(L.rejectTrade(S, tid, cid)),
      revert: (tid) => done(L.revertTrade(S, tid)),
      cancelTrade: (tid) => done(L.rejectTrade(S, tid, 'teacher')),
      setStage: (n) => done(L.setStage(S, cfg, n)),
      setFlag(path, v) { if (path === 'allowUndo') S.allowUndo = v; else S.locks[path.split('.')[1]] = v; return done({ ok: true }); },
      reset() { S = L.createState(cfg); return done({ ok: true }); },
      setConfig(nc) { cfg = nc; return done({ ok: true }); }
    };
    return api;
  }
  root.createLocalBackend = createLocalBackend;
})(window);
