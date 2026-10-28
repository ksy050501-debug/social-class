// 테스트용 가짜 Firebase (실제 서버 없이 여러 창을 서로 다른 기기처럼 연결)
const apps = {};
export function initializeApp(config, name = '[DEFAULT]') { if (apps[name]) throw new Error('duplicate-app'); apps[name] = { name, options: config }; return apps[name]; }
export function getApps() { return Object.values(apps); }
export function getApp(name = '[DEFAULT]') { return apps[name]; }
