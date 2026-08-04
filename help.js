const input = document.getElementById("helpSearchInput");
const items = [...document.querySelectorAll(".help-card, .help-topic-list article, .help-faq details")];
input?.addEventListener("input", () => {
  const query = input.value.trim().toLowerCase();
  items.forEach(item => { item.hidden = Boolean(query) && !item.textContent.toLowerCase().includes(query); });
});
