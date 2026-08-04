import { getConversations, renameConversation, deleteConversation, archiveConversation, pinConversation } from "./supabase.js";
import { requireAuthentication } from "./auth.js";

const $ = id => document.getElementById(id);
let conversations = [];
let selectedId = null;

function show(id, visible) { const el = $(id); if (el) el.hidden = !visible; }
function toast(message) {
  const region = $("toastRegion");
  if (!region) return;
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), 2800);
}
function formatDate(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

function card(conversation) {
  const template = $("historyConversationTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.id = conversation.id;
  node.querySelector(".conversation-title").textContent = conversation.title;
  node.querySelector(".conversation-meta").textContent = `${conversation.messages?.length || 0} messages · ${formatDate(conversation.updatedAt)}`;
  node.querySelector(".conversation-preview").textContent = conversation.messages?.at(-1)?.content?.slice(0, 180) || "No messages yet.";
  const buttons = node.querySelectorAll(".conversation-card-actions button");
  const [pin, rename, archive, remove] = buttons;
  pin.classList.toggle("active", conversation.isPinned);
  pin.addEventListener("click", async () => { await pinConversation(conversation.id, !conversation.isPinned); await load(); });
  rename.addEventListener("click", () => openRename(conversation));
  archive.addEventListener("click", async () => { await archiveConversation(conversation.id, !conversation.isArchived); await load(); });
  remove.addEventListener("click", () => openDelete(conversation.id));
  const link = node.querySelector(".conversation-open-button");
  link.href = `index.html?conversation=${encodeURIComponent(conversation.id)}`;
  return node;
}

function filtered() {
  const query = $("historySearchInput")?.value.trim().toLowerCase() || "";
  const status = $("historyStatusSelect")?.value || "all";
  const sort = $("historySortSelect")?.value || "newest";
  return conversations.filter(item => {
    const matchesText = !query || item.title.toLowerCase().includes(query) || item.messages?.some(message => message.content.toLowerCase().includes(query));
    const matchesStatus = status === "all" || (status === "pinned" && item.isPinned) || (status === "archived" && item.isArchived) || (status === "active" && !item.isArchived);
    return matchesText && matchesStatus;
  }).sort((a, b) => (sort === "oldest" ? 1 : -1) * (new Date(a.updatedAt) - new Date(b.updatedAt)));
}

function render() {
  const list = filtered();
  $("historyConversationCount").textContent = `${list.length} conversation${list.length === 1 ? "" : "s"}`;
  ["historyPinnedList", "historyConversationList", "historyArchivedList"].forEach(id => { if ($(id)) $(id).replaceChildren(); });
  const pinned = list.filter(item => item.isPinned && !item.isArchived);
  const active = list.filter(item => !item.isArchived && !item.isPinned);
  const archived = list.filter(item => item.isArchived);
  pinned.forEach(item => $("historyPinnedList")?.append(card(item)));
  active.forEach(item => $("historyConversationList")?.append(card(item)));
  archived.forEach(item => $("historyArchivedList")?.append(card(item)));
  show("historyPinnedSection", pinned.length > 0);
  show("historyActiveSection", active.length > 0);
  show("historyArchivedSection", archived.length > 0);
  show("historyEmptyState", conversations.length === 0);
  show("historySearchEmptyState", conversations.length > 0 && list.length === 0);
}

async function load() {
  show("historyLoadingState", true);
  show("historyErrorState", false);
  try {
    conversations = await getConversations({ limit: 500, includeArchived: true });
    render();
  } catch (error) {
    console.error(error);
    show("historyErrorState", true);
  } finally {
    show("historyLoadingState", false);
  }
}

function openRename(conversation) {
  selectedId = conversation.id;
  $("renameConversationInput").value = conversation.title;
  $("renameConversationModal").hidden = false;
  $("renameConversationInput").focus();
}
function openDelete(id) { selectedId = id; $("deleteConversationModal").hidden = false; }
function closeModal(id) { const modal = $(id); if (modal) modal.hidden = true; }

async function init() {
  await requireAuthentication();
  await load();
  ["historySearchInput", "historyStatusSelect", "historySortSelect"].forEach(id => $(id)?.addEventListener(id.includes("Input") ? "input" : "change", render));
  $("historyClearSearchButton")?.addEventListener("click", () => { $("historySearchInput").value = ""; $("historyStatusSelect").value = "all"; render(); });
  $("confirmRenameConversationButton")?.addEventListener("click", async () => {
    const title = $("renameConversationInput").value.trim();
    if (!selectedId || !title) return;
    await renameConversation(selectedId, title);
    closeModal("renameConversationModal");
    toast("Conversation renamed.");
    await load();
  });
  $("confirmDeleteConversationButton")?.addEventListener("click", async () => {
    if (!selectedId) return;
    await deleteConversation(selectedId);
    closeModal("deleteConversationModal");
    toast("Conversation deleted.");
    await load();
  });
  document.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init, { once: true }) : init();
