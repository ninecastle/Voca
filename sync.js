/* sync.js — Firebase(구글 무료 서버)와 기록을 주고받는 부분
 * Firebase 라이브러리는 구글 공식 배포 주소(gstatic)에서 불러오고,
 * 서비스 워커가 기기에 저장해 두기 때문에 다음부터는 인터넷 없이도 열려요.
 * ※ 버전을 바꾸면 sw.js의 FIREBASE_VERSION도 똑같이 바꿔 주세요.
 */
const FIREBASE_VERSION = '13.1.0';
const BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;

export async function start({ config, dev, onAuth, onRemote, onError }) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(BASE + 'firebase-app.js'),
    import(BASE + 'firebase-auth.js'),
    import(BASE + 'firebase-firestore.js')
  ]);

  const app = initializeApp(config);
  const auth = A.getAuth(app);
  // 기록 원본은 앱이 기기에 따로 저장하므로 Firestore는 메모리 캐시만 써요.
  const db = F.initializeFirestore(app, {});

  let ref = null;
  let unsub = null;

  function listen() {
    if (unsub) { unsub(); unsub = null; }
    if (!ref) return;
    const myRef = ref;
    unsub = F.onSnapshot(myRef, { includeMetadataChanges: true }, snap => {
      if (myRef !== ref) return;
      const d = snap.exists() ? snap.data() : null;
      onRemote(d && typeof d.state === 'string' ? d.state : null, {
        fromCache: snap.metadata.fromCache,
        pending: snap.metadata.hasPendingWrites
      });
    }, err => {
      unsub = null;
      onError(err);
    });
  }

  A.getRedirectResult(auth).catch(onError);
  A.onAuthStateChanged(auth, user => {
    ref = user ? F.doc(db, 'users', user.uid) : null;
    onAuth(user ? { uid: user.uid, email: user.email || '', name: user.displayName || '' } : null);
    listen();
  });

  return {
    async signIn() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      try { await A.signInWithPopup(auth, p); }
      catch (e) {
        // 팝업이 막힌 환경(일부 설치형 앱)에서는 페이지 이동 방식으로 다시 시도해요
        const c = (e && e.code) || '';
        if (/popup-blocked|operation-not-supported|popup-closed|cancelled-popup/.test(c)) { await A.signInWithRedirect(auth, p); return; }
        throw e;
      }
    },
    signOut() { return A.signOut(auth); },
    relisten: listen,
    /* 서버 기록을 읽고 → merge(서버 기록)로 합친 결과를 → 한 번에 저장 (동시에 써도 서로 덮어쓰지 않게) */
    transact(merge) {
      if (!ref) return Promise.reject(Object.assign(new Error('not signed in'), { code: 'no-user' }));
      const myRef = ref;
      return F.runTransaction(db, async tx => {
        const snap = await tx.get(myRef);
        const data = snap.exists() ? snap.data() : null;
        const cur = data && typeof data.state === 'string' ? data.state : null;
        const next = merge(cur);
        if (next != null && next !== cur) {
          tx.set(myRef, { state: next, v: 2, by: dev, at: F.serverTimestamp() });
        }
        return next;
      });
    }
  };
}
