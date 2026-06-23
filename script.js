(function(){
  "use strict";

  const STORAGE_KEY = "ledger_expenses_v1";
  const THEME_KEY = "ledger_theme_v1";

  const CATEGORY_COLORS = {
    Food: "#B5512E",
    Travel: "#3F6B86",
    Shopping: "#8C5BA6",
    Bills: "#3F6B4E",
    Other: "#8A8470"
  };

  // ---- State ----
  let expenses = loadExpenses();
  let activeFilter = "All";
  let editingId = null;
  let chart = null;

  // ---- Elements ----
  const form = document.getElementById("expenseForm");
  const nameInput = document.getElementById("name");
  const categoryInput = document.getElementById("category");
  const amountInput = document.getElementById("amount");
  const dateInput = document.getElementById("date");
  const submitBtn = document.getElementById("submitBtn");
  const cancelEditBtn = document.getElementById("cancelEdit");
  const formTitle = document.getElementById("formTitle");
  const expenseBody = document.getElementById("expenseBody");
  const emptyState = document.getElementById("emptyState");
  const filtersWrap = document.getElementById("filters");
  const themeToggle = document.getElementById("themeToggle");
  const toast = document.getElementById("toast");

  // Default date = today
  dateInput.value = new Date().toISOString().slice(0, 10);

  // ---- Storage ----
  function loadExpenses(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      console.error("Could not read stored expenses", e);
      return [];
    }
  }

  function saveExpenses(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  }

  // ---- Theme ----
  function initTheme(){
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved || "light";
    document.body.setAttribute("data-theme", theme);
  }
  themeToggle.addEventListener("click", () => {
    const current = document.body.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    renderChart(); // re-render so chart legend colors match theme text
  });

  // ---- Validation ----
  function clearErrors(){
    ["name","category","amount","date"].forEach(id => {
      document.getElementById("err-" + id).textContent = "";
      document.getElementById(id).classList.remove("invalid");
    });
  }

  function setError(id, message){
    document.getElementById("err-" + id).textContent = message;
    document.getElementById(id).classList.add("invalid");
  }

  function validate(){
    clearErrors();
    let valid = true;

    const name = nameInput.value.trim();
    if(!name){
      setError("name", "Give this expense a name.");
      valid = false;
    } else if(name.length > 60){
      setError("name", "Keep it under 60 characters.");
      valid = false;
    }

    if(!categoryInput.value){
      setError("category", "Pick a category.");
      valid = false;
    }

    const amount = parseFloat(amountInput.value);
    if(amountInput.value === "" || isNaN(amount)){
      setError("amount", "Enter an amount.");
      valid = false;
    } else if(amount <= 0){
      setError("amount", "Amount must be greater than zero.");
      valid = false;
    } else if(amount > 10000000){
      setError("amount", "That number looks too large.");
      valid = false;
    }

    if(!dateInput.value){
      setError("date", "Pick a date.");
      valid = false;
    }

    return valid;
  }

  // ---- Form submit (add / update) ----
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if(!validate()) return;

    const payload = {
      name: nameInput.value.trim(),
      category: categoryInput.value,
      amount: Math.round(parseFloat(amountInput.value) * 100) / 100,
      date: dateInput.value
    };

    if(editingId){
      const idx = expenses.findIndex(x => x.id === editingId);
      if(idx !== -1){
        expenses[idx] = { ...expenses[idx], ...payload };
        showToast("Expense updated.");
      }
      exitEditMode();
    } else {
      expenses.push({ id: cryptoId(), ...payload });
      showToast("Expense added.");
    }

    saveExpenses();
    resetForm();
    renderAll();
  });

  cancelEditBtn.addEventListener("click", () => {
    exitEditMode();
    resetForm();
  });

  function cryptoId(){
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function resetForm(){
    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    clearErrors();
  }

  function enterEditMode(id){
    const exp = expenses.find(x => x.id === id);
    if(!exp) return;
    editingId = id;
    nameInput.value = exp.name;
    categoryInput.value = exp.category;
    amountInput.value = exp.amount;
    dateInput.value = exp.date;
    formTitle.textContent = "Edit expense";
    submitBtn.textContent = "Save changes";
    cancelEditBtn.hidden = false;
    nameInput.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exitEditMode(){
    editingId = null;
    formTitle.textContent = "Add an expense";
    submitBtn.textContent = "Add expense";
    cancelEditBtn.hidden = true;
  }

  function deleteExpense(id){
    const exp = expenses.find(x => x.id === id);
    if(!exp) return;
    if(!confirm(`Delete "${exp.name}"? This can't be undone.`)) return;
    expenses = expenses.filter(x => x.id !== id);
    saveExpenses();
    if(editingId === id){ exitEditMode(); resetForm(); }
    renderAll();
    showToast("Expense deleted.");
  }

  // ---- Filters ----
  filtersWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if(!btn) return;
    activeFilter = btn.dataset.filter;
    [...filtersWrap.children].forEach(c => c.classList.toggle("active", c === btn));
    renderTable();
  });

  // ---- Rendering ----
  function formatMoney(n){
    return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(d){
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function renderTable(){
    const filtered = activeFilter === "All"
      ? expenses
      : expenses.filter(x => x.category === activeFilter);

    const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

    expenseBody.innerHTML = "";

    if(sorted.length === 0){
      emptyState.style.display = "block";
      emptyState.querySelector("p").textContent = expenses.length === 0
        ? "Nothing logged yet."
        : `No ${activeFilter.toLowerCase()} expenses yet.`;
    } else {
      emptyState.style.display = "none";
    }

    sorted.forEach(exp => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(exp.name)}</td>
        <td><span class="cat-badge"><span class="cat-dot" style="background:${CATEGORY_COLORS[exp.category] || "#888"}"></span>${escapeHtml(exp.category)}</span></td>
        <td class="num amount">${formatMoney(exp.amount)}</td>
        <td>${formatDate(exp.date)}</td>
        <td class="row-actions">
          <button class="icon-btn edit-btn" data-id="${exp.id}" title="Edit">✎ Edit</button>
          <button class="icon-btn danger delete-btn" data-id="${exp.id}" title="Delete">✕ Delete</button>
        </td>
      `;
      expenseBody.appendChild(tr);
    });
  }

  expenseBody.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".edit-btn");
    const delBtn = e.target.closest(".delete-btn");
    if(editBtn) enterEditMode(editBtn.dataset.id);
    if(delBtn) deleteExpense(delBtn.dataset.id);
  });

  function escapeHtml(str){
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderStats(){
    const total = expenses.reduce((sum, x) => sum + x.amount, 0);
    document.getElementById("statTotal").textContent = formatMoney(total);
    document.getElementById("statCount").textContent = `${expenses.length} ${expenses.length === 1 ? "entry" : "entries"}`;

    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const monthTotal = expenses.filter(x => x.date.slice(0, 7) === ym).reduce((s, x) => s + x.amount, 0);
    document.getElementById("statMonth").textContent = formatMoney(monthTotal);
    document.getElementById("statMonthLabel").textContent = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    const byCat = {};
    expenses.forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });
    const topEntry = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    document.getElementById("statTopCat").textContent = topEntry ? topEntry[0] : "—";
    document.getElementById("statTopCatAmt").textContent = topEntry ? formatMoney(topEntry[1]) : "Nothing logged yet";
  }

  function renderChart(){
    const byCat = {};
    expenses.forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });
    const labels = Object.keys(byCat);
    const data = Object.values(byCat);
    const empty = document.getElementById("chartEmpty");
    const canvas = document.getElementById("categoryChart");

    if(labels.length === 0){
      empty.style.display = "flex";
      canvas.style.display = "none";
      if(chart){ chart.destroy(); chart = null; }
      return;
    }

    empty.style.display = "none";
    canvas.style.display = "block";

    const isDark = document.body.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "#ECE7D8" : "#21221E";

    if(chart) chart.destroy();
    chart = new Chart(canvas, {
      type: "pie",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: labels.map(l => CATEGORY_COLORS[l] || "#888"),
          borderColor: isDark ? "#24251F" : "#FFFFFF",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: textColor, boxWidth: 10, font: { size: 11, family: "Inter" } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatMoney(ctx.parsed)}`
            }
          }
        }
      }
    });
  }

  function renderAll(){
    renderStats();
    renderTable();
    renderChart();
  }

  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  // ---- Init ----
  initTheme();
  renderAll();
})();
