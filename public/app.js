const list = document.getElementById('list');
const form = document.getElementById('new');

async function load() {
  const res = await fetch('/api/notes');
  const notes = await res.json();
  list.innerHTML = '';
  for (const n of notes) {
    const li = document.createElement('li');
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = n.title;
    const body = document.createElement('div');
    body.textContent = n.body;
    const when = document.createElement('small');
    when.textContent = new Date(n.created_at).toLocaleString();
    text.append(title, body, when);
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.onclick = async () => {
      await fetch(`/api/notes/${n.id}`, { method: 'DELETE' });
      load();
    };
    li.append(text, del);
    list.append(li);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  form.reset();
  load();
});

load();
