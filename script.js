"use strict";

const STORAGE_KEY = "set-choi-v1";
let state = { players: [], sets: [], nextSet: 1 };
let currentTab = "pending";
let noticeTimer;
const $ = (selector) => document.querySelector(selector);
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function notify(message) {
  $("#notice").textContent = message;
  $("#notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $("#notice").hidden = true; }, 3500);
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    if (!Array.isArray(saved.players) || !Array.isArray(saved.sets)) throw new Error("Invalid data");
    const ids = new Set();
    const players = saved.players.map((player) => {
      if (typeof player.id !== "string" || typeof player.name !== "string" || !player.name.trim() || ids.has(player.id)) throw new Error("Invalid player");
      ids.add(player.id);
      return { id: player.id, name: player.name };
    });
    const setIds = new Set();
    const sets = saved.sets.map((set) => {
      if (typeof set.id !== "string" || setIds.has(set.id) || !Number.isInteger(set.number) || set.number < 1 || !Array.isArray(set.slots) || set.slots.length !== 4 || typeof set.completed !== "boolean") throw new Error("Invalid set");
      setIds.add(set.id);
      const selected = new Set();
      const slots = set.slots.map((slot) => {
        if (slot === null) return null;
        if (typeof slot.id !== "string" || typeof slot.name !== "string" || selected.has(slot.id)) throw new Error("Invalid slot");
        selected.add(slot.id);
        return set.completed || ids.has(slot.id) ? { id: slot.id, name: slot.name } : null;
      });
      if (set.completed && slots.some((slot) => !slot)) throw new Error("Incomplete set");
      return { id: set.id, number: set.number, slots, completed: set.completed };
    });
    state = { players, sets, nextSet: Math.max(0, ...sets.map((set) => set.number)) + 1 };
    if (Number.isInteger(saved.nextSet) && saved.nextSet > state.nextSet) state.nextSet = saved.nextSet;
  } catch {
    notify("Không đọc được dữ liệu đã lưu. Bạn có thể bắt đầu lại.");
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { notify("Chưa lưu được dữ liệu. Hãy giữ trang này mở để tiếp tục chơi."); }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, className, action) {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function playerCount(id) {
  return state.sets.filter((set) => set.slots.some((slot) => slot?.id === id)).length;
}

function renderPlayers() {
  const list = $("#player-list");
  list.replaceChildren();
  $("#player-total").textContent = state.players.length;
  state.players.forEach((player) => {
    const row = element("li", "player-row");
    const count = element("span", "player-count", playerCount(player.id));
    count.setAttribute("aria-label", `${playerCount(player.id)} trận`);
    const remove = button("Xoá", "delete-player", () => removePlayer(player.id));
    remove.setAttribute("aria-label", `Xoá người chơi ${player.name}`);
    row.append(count, element("span", "player-label", player.name), remove);
    list.append(row);
  });
}

function removePlayer(id) {
  const player = state.players.find((item) => item.id === id);
  const used = state.sets.some((set) => !set.completed && set.slots.some((slot) => slot?.id === id));
  if (used && !confirm(`Xoá ${player.name}? Các vị trí của người này trong trận chưa đánh sẽ để trống.`)) return;
  state.players = state.players.filter((item) => item.id !== id);
  state.sets.filter((set) => !set.completed).forEach((set) => {
    set.slots = set.slots.map((slot) => slot?.id === id ? null : slot);
  });
  save();
  render();
}

function availablePlayers(set, index) {
  const others = new Set(set.slots.filter((slot, position) => position !== index && slot).map((slot) => slot.id));
  return state.players.filter((player) => !others.has(player.id));
}

function selectPlayer(set, index, id) {
  if (set.completed) return;
  const player = state.players.find((item) => item.id === id);
  if (id && (!player || !availablePlayers(set, index).some((item) => item.id === id))) return;
  set.slots[index] = player ? { id: player.id, name: player.name } : null;
  save();
  render();
  document.getElementById(`slot-${set.id}-${index}`)?.focus();
}

function renderSet(set) {
  const card = element("article", "set-card");
  const heading = element("div", "card-heading");
  heading.append(element("h3", "", `Trận ${String(set.number).padStart(2, "0")}`), element("span", `status${set.completed ? " done" : ""}`, set.completed ? "Đã hoàn thành" : "Chưa đánh"));
  const teams = element("div", "teams");
  [0, 1].forEach((teamIndex) => {
    if (teamIndex === 1) teams.append(element("span", "versus", "vs"));
    const team = element("div", "team");
    team.append(element("span", "team-title", `ĐỘI ${teamIndex === 0 ? "A" : "B"}`));
    for (let position = 0; position < 2; position++) {
      const index = teamIndex * 2 + position;
      if (set.completed) {
        team.append(element("p", "completed-name", set.slots[index].name));
      } else {
        const select = element("select");
        select.id = `slot-${set.id}-${index}`;
        select.setAttribute("aria-label", `Trận ${set.number}, đội ${teamIndex === 0 ? "A" : "B"}, người ${position + 1}`);
        const placeholder = element("option", "", "Chọn người");
        placeholder.value = "";
        select.append(placeholder);
        availablePlayers(set, index).forEach((player) => {
          const option = element("option", "", player.name);
          option.value = player.id;
          select.append(option);
        });
        select.value = set.slots[index]?.id || "";
        select.addEventListener("change", () => selectPlayer(set, index, select.value));
        team.append(select);
      }
    }
    teams.append(team);
  });
  const actions = element("div", "card-footer");
  const remove = button("Xoá trận", "delete-set", () => {
    if (!confirm(`Xoá trận ${set.number}?`)) return;
    state.sets = state.sets.filter((item) => item.id !== set.id);
    save();
    render();
  });
  remove.setAttribute("aria-label", `Xoá trận ${set.number}`);
  const complete = button(set.completed ? "↶ Chưa đánh" : "✓ Hoàn thành", `button ${set.completed ? "secondary" : "primary"}`, () => {
    if (set.completed) {
      set.slots = set.slots.map((slot) => state.players.some((player) => player.id === slot.id) ? slot : null);
      set.completed = false;
      switchTab("pending");
    } else {
      if (set.slots.some((slot) => !slot)) return;
      set.completed = true;
      notify(`Đã hoàn thành trận ${set.number}.`);
    }
    save();
    render();
  });
  if (!set.completed && set.slots.some((slot) => !slot)) {
    complete.disabled = true;
    complete.title = "Chọn đủ 4 người để hoàn thành trận";
  }
  actions.append(remove, complete);
  card.append(heading, teams, actions);
  return card;
}

function switchTab(tab) {
  currentTab = tab;
  render();
}

function render() {
  renderPlayers();
  $("#pending-total").textContent = state.sets.filter((set) => !set.completed).length;
  $("#completed-total").textContent = state.sets.filter((set) => set.completed).length;
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === currentTab;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  const list = $("#set-list");
  list.setAttribute("aria-labelledby", `tab-${currentTab}`);
  list.replaceChildren();
  const sets = state.sets.filter((set) => set.completed === (currentTab === "completed"));
  sets.forEach((set) => list.append(renderSet(set)));
  if (!sets.length) {
    const empty = element("div", "empty-state");
    empty.append(element("strong", "", currentTab === "pending" ? "Chưa có trận" : "Chưa có trận hoàn thành"));
    list.append(empty);
  }
}

$("#player-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#player-name");
  const name = input.value.trim().replace(/\s+/g, " ");
  if (!name) { input.focus(); return; }
  if (state.players.some((player) => player.name.normalize("NFC").toLocaleLowerCase("vi") === name.normalize("NFC").toLocaleLowerCase("vi"))) {
    notify("Tên người chơi đã tồn tại.");
    input.focus();
    return;
  }
  state.players.push({ id: uid(), name });
  input.value = "";
  save();
  render();
  input.focus();
});

$("#add-set").addEventListener("click", () => {
  state.sets.push({ id: uid(), number: state.nextSet++, slots: [null, null, null, null], completed: false });
  currentTab = "pending";
  save();
  render();
  $("#set-list").lastElementChild?.scrollIntoView({ block: "nearest" });
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === "Home" ? "pending" : event.key === "End" ? "completed" : currentTab === "pending" ? "completed" : "pending";
    switchTab(target);
    $(`#tab-${target}`).focus();
  });
});

load();
render();
