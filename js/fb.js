/* Firebase SDK 불러오기 (버전 고정). 다른 파일은 이 파일만 사용합니다. */
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  runTransaction, writeBatch, serverTimestamp, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const configured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);
export const fs = { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, runTransaction, writeBatch, serverTimestamp, query, where };
export const authApi = { getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut };

// name을 다르게 주면 한 페이지에서 여러 사용자(점검 페이지의 가상 학생)를 만들 수 있습니다.
export function connect(name) {
  const n = name || '[DEFAULT]';
  const app = getApps().some((a) => a.name === n) ? getApp(n) : initializeApp(firebaseConfig, n);
  return { app, db: getFirestore(app), auth: getAuth(app) };
}
