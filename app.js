import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const ROOMS = ["회의실1", "회의실2", "회의실3"];
const SLOT_MINUTES = 30;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const FULL_START_HOUR = 0;
const FULL_END_HOUR = 24;
const REGULAR_START_HOUR = 9;
const REGULAR_END_HOUR = 18;
const STORAGE_USER_KEY = "meetingRoomUserName";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const state = {
  selectedDate: startOfDay(new Date()),
  fullDay: false,
  reservations: [],
  userName: localStorage.getItem(STORAGE_USER_KEY) || ""
};

const els = {
  currentUserText: document.getElementById("currentUserText"),
  changeNameBtn: document.getElementById("changeNameBtn"),
  prevDayBtn: document.getElementById("prevDayBtn"),
  nextDayBtn: document.getElementById("nextDayBtn"),
  todayBtn: document.getElementById("todayBtn"),
  dateTitleBtn: document.getElementById("dateTitleBtn"),
  toggleHoursBtn: document.getElementById("toggleHoursBtn"),
  myReservationsBtn: document.getElementById("myReservationsBtn"),
  logsBtn: document.getElementById("logsBtn"),
  scheduleGrid: document.getElementById("scheduleGrid"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  toast: document.getElementById("toast")
};

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return startOfDay(d);
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTitle(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short"
  }).format(date);
}

function minutesToTime(total) {
  if (total === 1440) return "24:00";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function timestampToDate(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

function updateUserUI() {
  els.currentUserText.textContent = state.userName ? `사용자: ${state.userName}` : "사용자 미설정";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.add("hidden"), 2200);
}

function openModal(title, html) {
  els.modalTitle.textContent = title;
  els.modalBody.innerHTML = html;
  els.modalBackdrop.classList.remove("hidden");
  els.modalBackdrop.setAttribute("aria-hidden", "false");
}

function closeModal() {
  els.modalBackdrop.classList.add("hidden");
  els.modalBackdrop.setAttribute("aria-hidden", "true");
  els.modalBody.innerHTML = "";
}

function promptForName(force = false) {
  if (state.userName && !force) return Promise.resolve(state.userName);
  return new Promise((resolve) => {
    openModal("사용자 이름", `
      <div class="form-group">
        <label for="nameInput">이름</label>
        <input id="nameInput" class="form-control" maxlength="20" autocomplete="name" value="${escapeHtml(state.userName)}" placeholder="이름을 입력하세요" />
      </div>
      <p class="subtitle">한 번 저장하면 이 브라우저에서 자동으로 기억합니다.</p>
      <div class="modal-actions">
        ${state.userName ? '<button id="cancelNameBtn" class="btn btn-secondary" type="button">취소</button>' : ''}
        <button id="saveNameBtn" class="btn btn-primary" type="button">저장</button>
      </div>
    `);
    const input = document.getElementById("nameInput");
    input.focus();
    document.getElementById("saveNameBtn").onclick = () => {
      const value = input.value.trim();
      if (!value) return showToast("이름을 입력해 주세요.");
      state.userName = value;
      localStorage.setItem(STORAGE_USER_KEY, value);
      updateUserUI();
      closeModal();
      renderSchedule();
      resolve(value);
    };
    document.getElementById("cancelNameBtn")?.addEventListener("click", () => {
      closeModal();
      resolve(state.userName);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") document.getElementById("saveNameBtn").click();
    });
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getVisibleRange() {
  return state.fullDay
    ? [FULL_START_HOUR * 60, FULL_END_HOUR * 60]
    : [DEFAULT_START_HOUR * 60, DEFAULT_END_HOUR * 60];
}

function getSlotClass(minute) {
  const hour = minute / 60;
  if (hour >= REGULAR_START_HOUR && hour < REGULAR_END_HOUR) return "regular-hours";
  if ((hour >= DEFAULT_START_HOUR && hour < REGULAR_START_HOUR) || (hour >= REGULAR_END_HOUR && hour < DEFAULT_END_HOUR)) return "extended-hours";
  return "night-hours";
}


function renderSchedule() {
  updateUserUI();
  els.dateTitleBtn.textContent = formatDateTitle(state.selectedDate);
  els.toggleHoursBtn.textContent = state.fullDay ? "기본시간 보기" : "24시간 보기";
  const [startMinute, endMinute] = getVisibleRange();
  let html = '<div class="grid-cell grid-header">시간</div>';
  html += ROOMS.map(room => `<div class="grid-cell grid-header">${room}</div>`).join("");

  for (let minute = startMinute; minute < endMinute; minute += SLOT_MINUTES) {
    html += `<div class="grid-cell time-cell">${minutesToTime(minute)}</div>`;
    for (const room of ROOMS) {
      const reservation = state.reservations.find(item =>
        item.room === room && item.startMinutes <= minute && item.endMinutes > minute
      );
      const isStart = reservation?.startMinutes === minute;
      const classes = ["grid-cell", "slot", getSlotClass(minute)];
      if (reservation) {
        classes.push("occupied");
        classes.push(reservation.userName === state.userName ? "occupied-mine" : "occupied-other");
      }
      if (reservation && !isStart) classes.push("continuation");

      let content = "";
      if (reservation && isStart) {
        const mine = reservation.userName === state.userName ? " mine" : "";
        content = `
          <div class="reservation-card${mine}" data-reservation-id="${reservation.id}">
            <span class="reservation-name">${escapeHtml(reservation.userName)}</span>
            <span class="reservation-title">${escapeHtml(reservation.title || "회의실 사용")}</span>
            <span class="reservation-time">${minutesToTime(reservation.startMinutes)}~${minutesToTime(reservation.endMinutes)}</span>
          </div>`;
      }
      html += `<div class="${classes.join(" ")}" data-room="${room}" data-minute="${minute}" ${reservation ? `data-reservation-id="${reservation.id}"` : ""}>${content}</div>`;
    }
  }
  els.scheduleGrid.innerHTML = html;
}

function subscribeReservations() {
  const dateKey = formatDateKey(state.selectedDate);
  const q = query(collection(db, "reservations"), where("dateKey", "==", dateKey));
  if (subscribeReservations.unsubscribe) subscribeReservations.unsubscribe();
  subscribeReservations.unsubscribe = onSnapshot(q, (snapshot) => {
    state.reservations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSchedule();
  }, (error) => {
    console.error(error);
    showToast("예약 정보를 불러오지 못했습니다. Firebase 설정을 확인해 주세요.");
  });
}

async function openReservationForm(room, startMinutes) {
  await promptForName();
  const defaultEnd = Math.min(startMinutes + 60, 1440);
  const endOptions = [];
  for (let m = startMinutes + SLOT_MINUTES; m <= 1440; m += SLOT_MINUTES) {
    endOptions.push(`<option value="${m}" ${m === defaultEnd ? "selected" : ""}>${minutesToTime(m)}</option>`);
  }
  openModal("예약하기", `
    <div class="summary-card">
      <strong>${room}</strong><br />
      ${formatDateTitle(state.selectedDate)} · ${minutesToTime(startMinutes)} 시작<br />
      예약자: ${escapeHtml(state.userName)}
    </div>
    <div class="form-row" style="margin-top:15px">
      <div class="form-group">
        <label>시작시간</label>
        <input class="form-control" value="${minutesToTime(startMinutes)}" disabled />
      </div>
      <div class="form-group">
        <label for="endTimeSelect">종료시간</label>
        <select id="endTimeSelect" class="form-control">${endOptions.join("")}</select>
      </div>
    </div>
    <div class="form-group">
      <label for="titleInput">회의명 또는 사용 목적 <span class="subtitle">(선택)</span></label>
      <input id="titleInput" class="form-control" maxlength="60" placeholder="예: 주간회의" />
    </div>
    <div class="modal-actions">
      <button id="cancelReservationBtn" class="btn btn-secondary" type="button">취소</button>
      <button id="saveReservationBtn" class="btn btn-primary" type="button">예약하기</button>
    </div>
  `);
  document.getElementById("cancelReservationBtn").onclick = closeModal;
  document.getElementById("saveReservationBtn").onclick = async () => {
    const endMinutes = Number(document.getElementById("endTimeSelect").value);
    const title = document.getElementById("titleInput").value.trim();
    const overlapping = state.reservations.some(item =>
      item.room === room && startMinutes < item.endMinutes && endMinutes > item.startMinutes
    );
    if (overlapping) return showToast("선택한 시간에 이미 예약이 있습니다.");
    try {
      await addDoc(collection(db, "reservations"), {
        room,
        dateKey: formatDateKey(state.selectedDate),
        startMinutes,
        endMinutes,
        userName: state.userName,
        title,
        createdAt: serverTimestamp(),
        clientCreatedAt: new Date().toISOString()
      });
      closeModal();
      showToast("예약되었습니다.");
    } catch (error) {
      console.error(error);
      showToast("예약 저장에 실패했습니다.");
    }
  };
}

function openReservationDetail(reservation) {
  openModal("예약 상세", `
    <div class="summary-card">
      <strong>${escapeHtml(reservation.room)}</strong><br />
      ${formatDateTitle(state.selectedDate)}<br />
      ${minutesToTime(reservation.startMinutes)}~${minutesToTime(reservation.endMinutes)}<br />
      예약자: ${escapeHtml(reservation.userName)}<br />
      회의명: ${escapeHtml(reservation.title || "미입력")}
    </div>
    <div class="modal-actions">
      <button id="closeDetailBtn" class="btn btn-secondary" type="button">닫기</button>
      <button id="deleteReservationBtn" class="btn btn-danger" type="button">예약 삭제</button>
    </div>
  `);
  document.getElementById("closeDetailBtn").onclick = closeModal;
  document.getElementById("deleteReservationBtn").onclick = () => openDeleteConfirmation(reservation);
}

async function openDeleteConfirmation(reservation) {
  await promptForName();
  openModal("예약 삭제 확인", `
    <div class="warning">
      <strong>선예약이 있습니다.</strong><br />
      그래도 이 예약을 삭제하시겠습니까?
    </div>
    <div class="summary-card">
      예약자: ${escapeHtml(reservation.userName)}<br />
      회의실: ${escapeHtml(reservation.room)}<br />
      일시: ${formatDateTitle(state.selectedDate)} ${minutesToTime(reservation.startMinutes)}~${minutesToTime(reservation.endMinutes)}<br />
      회의명: ${escapeHtml(reservation.title || "미입력")}<br />
      삭제자: ${escapeHtml(state.userName)}
    </div>
    <div class="modal-actions">
      <button id="cancelDeleteBtn" class="btn btn-secondary" type="button">아니요</button>
      <button id="confirmDeleteBtn" class="btn btn-danger" type="button">그래도 삭제</button>
    </div>
  `);
  document.getElementById("cancelDeleteBtn").onclick = closeModal;
  document.getElementById("confirmDeleteBtn").onclick = async () => {
    try {
      const batch = writeBatch(db);
      const reservationRef = doc(db, "reservations", reservation.id);
      const logRef = doc(collection(db, "reservation_logs"));
      batch.set(logRef, {
        action: "DELETE",
        reservationId: reservation.id,
        originalReservation: { ...reservation },
        originalUserName: reservation.userName,
        deletedBy: state.userName,
        room: reservation.room,
        dateKey: reservation.dateKey,
        startMinutes: reservation.startMinutes,
        endMinutes: reservation.endMinutes,
        title: reservation.title || "",
        deletedAt: serverTimestamp(),
        clientDeletedAt: new Date().toISOString()
      });
      batch.delete(reservationRef);
      await batch.commit();
      closeModal();
      showToast("예약을 삭제하고 기록을 남겼습니다.");
    } catch (error) {
      console.error(error);
      showToast("삭제에 실패했습니다.");
    }
  };
}

async function openMyReservations() {
  await promptForName();
  const todayKey = formatDateKey(startOfDay(new Date()));
  const q = query(collection(db, "reservations"), where("userName", "==", state.userName));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const items = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(item => item.dateKey >= todayKey)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMinutes - b.startMinutes);
    openModal(`내 예약 ${items.length}건`, items.length ? `
      <div class="list">
        ${items.map(item => `
          <div class="list-item">
            <button type="button" data-my-reservation-id="${item.id}">
              <div class="list-title">${escapeHtml(item.room)} · ${minutesToTime(item.startMinutes)}~${minutesToTime(item.endMinutes)}</div>
              <div class="list-meta">${escapeHtml(item.dateKey)} · ${escapeHtml(item.title || "회의실 사용")}</div>
            </button>
          </div>`).join("")}
      </div>` : '<div class="empty-state">예정된 예약이 없습니다.</div>');
    document.querySelectorAll("[data-my-reservation-id]").forEach(button => {
      button.onclick = () => {
        const item = items.find(x => x.id === button.dataset.myReservationId);
        if (!item) return;
        state.selectedDate = startOfDay(new Date(`${item.dateKey}T00:00:00`));
        closeModal();
        subscribeReservations();
      };
    });
    unsubscribe();
  }, (error) => {
    console.error(error);
    showToast("내 예약을 불러오지 못했습니다.");
  });
}

function openDeleteLogs() {
  const q = query(collection(db, "reservation_logs"), orderBy("deletedAt", "desc"), limit(100));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    openModal("삭제 내역", items.length ? `
      <div class="list">
        ${items.map(item => {
          const deletedAt = timestampToDate(item.deletedAt);
          return `
          <div class="list-item">
            <div class="list-title">${escapeHtml(item.room)} · ${minutesToTime(item.startMinutes)}~${minutesToTime(item.endMinutes)}</div>
            <div class="list-meta">
              예약자 ${escapeHtml(item.originalUserName)} → 삭제자 ${escapeHtml(item.deletedBy)}<br />
              ${escapeHtml(item.dateKey)} · ${escapeHtml(item.title || "회의실 사용")}<br />
              삭제시각 ${deletedAt ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(deletedAt) : "기록 중"}
            </div>
          </div>`;
        }).join("")}
      </div>` : '<div class="empty-state">삭제 내역이 없습니다.</div>');
    unsubscribe();
  }, (error) => {
    console.error(error);
    showToast("삭제 내역을 불러오지 못했습니다.");
  });
}

els.scheduleGrid.addEventListener("click", (event) => {
  const slot = event.target.closest(".slot");
  if (!slot) return;
  const reservationId = slot.dataset.reservationId;
  if (reservationId) {
    const reservation = state.reservations.find(item => item.id === reservationId);
    if (reservation) openReservationDetail(reservation);
    return;
  }
  openReservationForm(slot.dataset.room, Number(slot.dataset.minute));
});

els.prevDayBtn.onclick = () => { state.selectedDate = addDays(state.selectedDate, -1); subscribeReservations(); };
els.nextDayBtn.onclick = () => { state.selectedDate = addDays(state.selectedDate, 1); subscribeReservations(); };
els.todayBtn.onclick = () => { state.selectedDate = startOfDay(new Date()); subscribeReservations(); };
els.toggleHoursBtn.onclick = () => { state.fullDay = !state.fullDay; renderSchedule(); };
els.changeNameBtn.onclick = () => promptForName(true);
els.myReservationsBtn.onclick = openMyReservations;
els.logsBtn.onclick = openDeleteLogs;
els.modalCloseBtn.onclick = closeModal;
els.modalBackdrop.addEventListener("click", (event) => { if (event.target === els.modalBackdrop) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

updateUserUI();
renderSchedule();
subscribeReservations();
if (!state.userName) promptForName();
window.setInterval(() => renderSchedule(), 60 * 1000);
