/* 교사·학생 페이지가 함께 쓰는 작은 도우미 */
export const el = (id) => document.getElementById(id);

export function setupNotice(main) {
  main.innerHTML = `<div class="gate"><section class="panel"><h2>Firebase 연결 설정이 필요해요</h2>
    <p style="margin:0">실시간 수업을 하려면 <code>js/firebase-config.js</code>에 Firebase 프로젝트 정보를 넣어야 합니다. 저장소의 README 2단계를 따라 해 주세요.</p>
    <p class="muted" style="margin:0">설정 전에도 <a href="demo.html">시연 모드</a>로 한 기기에서 수업 흐름을 시험할 수 있어요.</p></section></div>`;
}

// 로그인·입장 같은 첫 화면 버튼(data-g) 처리
export function gateClick(handler) {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b || b.disabled) return;
    e.preventDefault();
    handler(b.dataset.g, b);
  });
}
