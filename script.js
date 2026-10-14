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
      return { id: set.id, number: set.number, slots, completed: set.completed, playing: !set.completed && set.playing === true && slots.every(Boolean) };
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
  if (used && !confirm(`Xoá ${player.name}? Các vị trí trong trận chưa hoàn thành sẽ để trống, trận đang đánh sẽ chuyển về chưa đánh.`)) return;
  state.players = state.players.filter((item) => item.id !== id);
  state.sets.filter((set) => !set.completed).forEach((set) => {
    set.slots = set.slots.map((slot) => slot?.id === id ? null : slot);
    if (set.slots.some((slot) => !slot)) set.playing = false;
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
  if (set.slots.some((slot) => !slot)) set.playing = false;
  save();
  render();
  document.getElementById(`slot-${set.id}-${index}`)?.focus();
}

let activePicker = null;
let pendingDeleteId = null;

function closePlayerPicker(restoreFocus = false) {
  if (!activePicker) return;
  const { wrapper, trigger, list } = activePicker;
  list.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  wrapper.closest(".set-card")?.classList.remove("picker-open");
  activePicker = null;
  if (restoreFocus) trigger.focus();
}

function openPlayerPicker(set, index, wrapper, trigger, list, focusOption = false) {
  if (activePicker?.trigger === trigger) {
    closePlayerPicker(true);
    return;
  }
  closePlayerPicker();
  list.replaceChildren();
  let selectedOption;
  availablePlayers(set, index).forEach((player) => {
    const selected = set.slots[index]?.id === player.id;
    const option = button("", `picker-option${selected ? " selected" : ""}`, () => {
      closePlayerPicker();
      selectPlayer(set, index, player.id);
    });
    option.setAttribute("aria-pressed", String(selected));
    const mark = element("span", "option-mark", selected ? "✓" : "");
    mark.setAttribute("aria-hidden", "true");
    option.append(element("span", "option-name", player.name), mark);
    list.append(option);
    if (selected) selectedOption = option;
  });
  if (set.slots[index]) {
    list.append(button("Bỏ chọn", "picker-option clear-option", () => {
      closePlayerPicker();
      selectPlayer(set, index, "");
    }));
  }
  if (!list.children.length) list.append(element("p", "picker-empty", "Chưa có người chơi"));
  list.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  wrapper.closest(".set-card")?.classList.add("picker-open");
  activePicker = { wrapper, trigger, list };
  if (focusOption) (selectedOption || list.querySelector("button") || trigger).focus();
}

function renderSet(set) {
  const card = element("article", `set-card${set.playing ? " is-playing" : ""}`);
  const heading = element("div", "card-heading");
  heading.append(element("h3", "", `Trận ${String(set.number).padStart(2, "0")}`), element("span", `status${set.completed ? " done" : set.playing ? " playing" : ""}`, set.completed ? "Đã hoàn thành" : set.playing ? "Đang đánh" : "Chưa đánh"));
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
        const wrapper = element("div", "player-dropdown");
        const list = element("div", "picker-options");
        list.id = `options-${set.id}-${index}`;
        list.hidden = true;
        list.setAttribute("role", "group");
        list.setAttribute("aria-label", "Người chơi");
        const trigger = button("", `player-select${set.slots[index] ? "" : " placeholder"}`, () => openPlayerPicker(set, index, wrapper, trigger, list));
        trigger.id = `slot-${set.id}-${index}`;
        trigger.setAttribute("aria-label", `Trận ${set.number}, đội ${teamIndex === 0 ? "A" : "B"}, người ${position + 1}: ${set.slots[index]?.name || "Chọn người"}`);
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", list.id);
        trigger.addEventListener("keydown", (event) => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          event.preventDefault();
          if (activePicker?.trigger === trigger) list.querySelector("button")?.focus();
          else openPlayerPicker(set, index, wrapper, trigger, list, true);
        });
        list.addEventListener("keydown", (event) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const options = Array.from(list.querySelectorAll("button"));
          if (!options.length) return;
          event.preventDefault();
          const position = options.indexOf(document.activeElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (position + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
          options[next].focus();
        });
        const arrow = element("span", "select-arrow");
        arrow.setAttribute("aria-hidden", "true");
        trigger.append(element("span", "select-name", set.slots[index]?.name || "Chọn người"), arrow);
        wrapper.append(trigger, list);
        team.append(wrapper);
      }
    }
    teams.append(team);
  });
  const actions = element("div", "card-footer");
  const remove = button("Xoá trận", "delete-set", () => {
    closePlayerPicker();
    pendingDeleteId = set.id;
    $("#delete-match-title").textContent = `Xoá trận ${set.number}?`;
    $("#delete-match-dialog").showModal();
  });
  remove.setAttribute("aria-label", `Xoá trận ${set.number}`);
  const complete = button(set.completed ? "↶ Chưa đánh" : set.playing ? "✓ Hoàn thành" : "▶ Bắt đầu", `button ${set.completed ? "secondary" : set.playing ? "primary" : "start-button"}`, () => {
    if (set.completed) {
      set.slots = set.slots.map((slot) => state.players.some((player) => player.id === slot.id) ? slot : null);
      set.completed = false;
      set.playing = false;
      switchTab("pending");
    } else {
      if (set.slots.some((slot) => !slot)) return;
      if (set.playing) {
        set.completed = true;
        set.playing = false;
        notify(`Đã hoàn thành trận ${set.number}.`);
      } else {
        set.playing = true;
      }
    }
    save();
    render();
  });
  if (!set.completed && set.slots.some((slot) => !slot)) {
    complete.disabled = true;
    complete.title = "Chọn đủ 4 người để bắt đầu trận";
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
  closePlayerPicker();
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
  state.sets.push({ id: uid(), number: state.nextSet++, slots: [null, null, null, null], completed: false, playing: false });
  currentTab = "pending";
  save();
  render();
  $("#set-list").lastElementChild?.scrollIntoView({ block: "nearest" });
});

document.addEventListener("pointerdown", (event) => {
  if (activePicker && !activePicker.wrapper.contains(event.target)) closePlayerPicker();
});

document.addEventListener("focusin", (event) => {
  if (activePicker && !activePicker.wrapper.contains(event.target)) closePlayerPicker();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activePicker) {
    event.preventDefault();
    closePlayerPicker(true);
  }
});

$("#cancel-delete-match").addEventListener("click", () => {
  $("#delete-match-dialog").close();
});

$("#delete-match-dialog").addEventListener("close", () => {
  pendingDeleteId = null;
});

$("#confirm-delete-match").addEventListener("click", () => {
  if (!$("#delete-match-dialog").open || !pendingDeleteId) return;
  state.sets = state.sets.filter((set) => set.id !== pendingDeleteId);
  $("#delete-match-dialog").close();
  save();
  render();
  $("#add-set").focus();
});

$("#reset-data").addEventListener("click", () => {
  $("#reset-dialog").showModal();
});

$("#cancel-reset").addEventListener("click", () => {
  $("#reset-dialog").close();
});

$("#confirm-reset").addEventListener("click", () => {
  if (!$("#reset-dialog").open) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    $("#reset-dialog").close();
    notify("Không xoá được dữ liệu đã lưu. Vui lòng thử lại.");
    return;
  }
  state = { players: [], sets: [], nextSet: 1 };
  currentTab = "pending";
  $("#player-name").value = "";
  render();
  $("#reset-dialog").close();
  notify("Đã reset dữ liệu.");
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
