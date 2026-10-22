const container = document.getElementById('body');

function wipeHTML() {
    container.innerHTML = '';
}

function renderLogin() {
    wipeHTML();
    const loginElement = document.createElement('div');
    container.appendChild(loginElement);
    const label = loginElement.appendChild(document.createElement('label'));
    label.setAttribute('for', 'username');
    label.textContent = 'Username:';
    container.appendChild(label);
    const username = loginElement.appendChild(document.createElement('input'));
    username.setAttribute('type', 'text');
    username.setAttribute('id', 'username');
    username.setAttribute('name', 'username');
    container.appendChild(username);
    const password = loginElement.appendChild(document.createElement('input'));
    password.setAttribute('type', 'password');
    password.setAttribute('id', 'password');
    password.setAttribute('name', 'password');
    container.appendChild(password);
}

function renderSignup() {
    wipeHTML();
}

function renderSearch() {
    wipeHTML();
}

function renderDecks() {
    wipeHTML();
}

function renderDeck(ID, view) {
    wipeHTML();
}

function renderSettings() {
    wipeHTML();
}

renderLogin();