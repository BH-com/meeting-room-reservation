import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const ROOMS = ["회의실1", "회의실2", "회의실3"];
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const params = new URLSearchParams(location.search);
const roomParam = params.get("room");
const singleRoom = ROOMS.includes(roomParam) ? roomParam : "";

const state = {
  selectedDate: startOfDay(new Date()),
  reservations: []
};

const els = {
  title: document.getElementById("displayTitle"),
  subtitle: document.getElementById("displaySubtitle"),
  clockTime: document.getElementById("clockTime"),
  clockDate: document.getElementById("clockDate"),
  allRoomsView: document.getElementById("allRoomsView"),
  singleRoomView: document.getElementById("singleRoomView")
};

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function minutesToTime(total) {
  if (total === 1440) return "24:00";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function formatClock() {
  const now = new Date();
  els.clockTime.textContent = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
  els.clockDate.textContent = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
}

function getRoomInfo(room) {
  const items = state.reservations
    .filter(item => item.room === room)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const currentMinutes = nowMinutes();
  const active = items.find(item => item.startMinutes <= currentMinutes && item.endMinutes > currentMinutes);
  const next = items.find(item => item.startMinutes > currentMinutes);
  const later = items.filter(item => item.startMinutes > currentMinutes).slice(0, 3);
  return { items, active, next, later };
}

function badgeHtml(type, text) {
  return `<span class="status-badge ${type}"><span class="status-dot"></span>${text}</span>`;
}

function cardStatus(room) {
  const { active, next } = getRoomInfo(room);
  if (active) {
    return {
      badge: badgeHtml("busy", `사용 중 · ${minutesToTime(active.endMinutes)}까지`),
      main: `${minutesToTime(active.startMinutes)}~${minutesToTime(active.endMinutes)}`,
      sub: `예약자: ${escapeHtml(active.userName)}<br />회의명: ${escapeHtml(active.title || "미입력")}`,
      nextHtml: next
        ? `<div class="info-label">다음 예약</div><div class="info-main">${minutesToTime(next.startMinutes)}~${minutesToTime(next.endMinutes)}</div><div class="info-sub">${escapeHtml(next.userName)} · ${escapeHtml(next.title || "회의실 사용")}</div>`
        : `<div class="info-label">다음 예약</div><div class="info-sub info-empty">오늘 남은 예약이 없습니다.</div>`
    };
  }
  if (next) {
    return {
      badge: badgeHtml("upcoming", `사용 가능 · 다음 ${minutesToTime(next.startMinutes)}`),
      main: "지금 비어 있음",
      sub: `다음 예약 ${minutesToTime(next.startMinutes)}~${minutesToTime(next.endMinutes)}<br />${escapeHtml(next.userName)} · ${escapeHtml(next.title || "회의실 사용")}`,
      nextHtml: `<div class="info-label">다음 예약</div><div class="info-main">${minutesToTime(next.startMinutes)}~${minutesToTime(next.endMinutes)}</div><div class="info-sub">${escapeHtml(next.userName)} · ${escapeHtml(next.title || "회의실 사용")}</div>`
    };
  }
  return {
    badge: badgeHtml("free", "사용 가능"),
    main: "오늘 예약 없음",
    sub: "현재 예정된 예약이 없습니다.",
    nextHtml: `<div class="info-label">다음 예약</div><div class="info-sub info-empty">오늘 남은 예약이 없습니다.</div>`
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAllRooms() {
  els.allRoomsView.classList.remove("hidden");
  els.singleRoomView.classList.add("hidden");
  els.title.textContent = "회의실 이용현황";
  els.subtitle.textContent = "회의실 앞 모니터용 실시간 현황 화면입니다.";
  els.allRoomsView.innerHTML = ROOMS.map(room => {
    const info = cardStatus(room);
    const laterItems = getRoomInfo(room).later;
    return `
      <article class="monitor-card">
        <div class="card-head">
          <div class="room-title">${room}</div>
          ${info.badge}
        </div>
        <div class="card-body">
          <section class="info-block">
            <div class="info-label">현재 상태</div>
            <div class="info-main">${info.main}</div>
            <div class="info-sub">${info.sub}</div>
          </section>
          <section class="info-block">
            ${info.nextHtml}
          </section>
          <section class="info-block">
            <div class="info-label">오늘 이후 예약</div>
            <div class="schedule-mini">
              ${laterItems.length ? laterItems.map(item => `
                <div class="schedule-item">
                  <div class="schedule-time">${minutesToTime(item.startMinutes)}~${minutesToTime(item.endMinutes)}</div>
                  <div class="schedule-meta">${escapeHtml(item.userName)} · ${escapeHtml(item.title || "회의실 사용")}</div>
                </div>`).join("") : `<div class="info-sub info-empty">표시할 다음 예약이 없습니다.</div>`}
            </div>
          </section>
        </div>
      </article>`;
  }).join("");
}

function renderSingleRoom(room) {
  els.allRoomsView.classList.add("hidden");
  els.singleRoomView.classList.remove("hidden");
  els.title.textContent = `${room} 이용현황`;
  els.subtitle.textContent = "회의실 앞 개별 모니터용 화면입니다.";
  const info = cardStatus(room);
  const { active, later } = getRoomInfo(room);
  els.singleRoomView.innerHTML = `
    <article class="single-card">
      <div class="room-title">${room}</div>
      <div class="single-layout">
        <section class="hero-panel">
          <div class="hero-status">${info.badge}</div>
          <div class="hero-main">${active ? `현재 사용 중` : info.main}</div>
          <div class="hero-sub">${active ? `${minutesToTime(active.startMinutes)}~${minutesToTime(active.endMinutes)}<br />예약자: ${escapeHtml(active.userName)}<br />회의명: ${escapeHtml(active.title || "미입력")}` : info.sub}</div>
          <div class="tip">주소 뒤에 <strong>?room=회의실1</strong>, <strong>?room=회의실2</strong>, <strong>?room=회의실3</strong> 를 붙이면 각 회의실 전용 화면으로 사용할 수 있습니다.</div>
        </section>
        <div class="side-stack">
          <section class="info-block">
            ${info.nextHtml}
          </section>
          <section class="info-block">
            <div class="info-label">오늘 이후 예약</div>
            <div class="schedule-mini">
              ${later.length ? later.map(item => `
                <div class="schedule-item">
                  <div class="schedule-time">${minutesToTime(item.startMinutes)}~${minutesToTime(item.endMinutes)}</div>
                  <div class="schedule-meta">${escapeHtml(item.userName)} · ${escapeHtml(item.title || "회의실 사용")}</div>
                </div>`).join("") : `<div class="info-sub info-empty">표시할 다음 예약이 없습니다.</div>`}
            </div>
          </section>
        </div>
      </div>
    </article>`;
}

function render() {
  if (singleRoom) renderSingleRoom(singleRoom);
  else renderAllRooms();
}

function subscribeReservations() {
  const q = query(collection(db, "reservations"), where("dateKey", "==", formatDateKey(state.selectedDate)));
  onSnapshot(q, (snapshot) => {
    state.reservations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, (error) => {
    console.error(error);
    els.allRoomsView.innerHTML = `<div class="info-block">데이터를 불러오지 못했습니다. Firebase 설정을 확인해 주세요.</div>`;
  });
}

formatClock();
render();
subscribeReservations();
window.setInterval(() => {
  formatClock();
  render();
}, 1000);
