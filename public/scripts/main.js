let password = "";
let username = "";

const container = document.getElementById('body');

function wipeHTML() {
    container.innerHTML = '';
    container.className = '';
}

function createElement(tag, attributes = {}, text = '') {
    const element = document.createElement(tag);
    for (const name in attributes) {
        element.setAttribute(name, attributes[name]);
    }
    element.textContent = text;
    return element;
}

function createField(labelText, type, id, name, placeholder) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createElement('label', { for: id }, labelText));
    fragment.appendChild(createElement('input', { type, id, name, placeholder }));
    return fragment;
}

function createLink(text, onClick) {
    const link = createElement('a', { href: '#' }, text);
    link.addEventListener('click', (event) => {
        event.preventDefault();
        onClick();
    });
    return link;
}

function createButton(text, onClick) {
    const button = createElement('button', { type: 'button' }, text);
    button.addEventListener('click', onClick);
    return button;
}

async function submitCredentials(endpoint, form) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: form.elements['Username'].value,
            password: form.elements['Password'].value
        })
    });
    const data = await response.json();

    if (!response.ok) {
        let error = form.querySelector('.FormError');
        if (!error) {
            error = form.appendChild(createElement('p', { class: 'FormError' }));
        }
        error.textContent = data.error;
        return;
    }
    username = data.username;
    renderSearch();
}

function renderLogin() {
    wipeHTML();
    container.className = 'AuthPage';

    const header = container.appendChild(createElement('div', { class: 'HeaderText' }));
    header.appendChild(createElement('h1', {}, 'Sign into CardKeeper'));

    const form = container.appendChild(createElement('form'));
    const userInput = form.appendChild(createElement('div', { class: 'UserInput' }));
    userInput.appendChild(createField('Username:', 'text', 'Account-Username', 'Username', 'Username'));
    userInput.appendChild(createField('Password:', 'password', 'Account-Password', 'Password', 'Enter Password'));
    userInput.appendChild(createElement('button', { type: 'submit' }, 'Sign In'));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitCredentials('/api/login', form);
    });

    const footer = container.appendChild(createElement('p', {}, 'New to CardKeeper? '));
    footer.appendChild(createLink('Create an account', renderSignup));
}

function renderSignup() {
    wipeHTML();
    container.className = 'AuthPage';

    const header = container.appendChild(createElement('div', { class: 'HeaderText' }));
    header.appendChild(createElement('h1', {}, 'Sign up for CardKeeper'));

    const form = container.appendChild(createElement('form'));
    const userInput = form.appendChild(createElement('div', { class: 'UserInput' }));
    userInput.appendChild(createField('Username:', 'text', 'Account-Username', 'Username', 'Username'));
    userInput.appendChild(createField('Password:', 'password', 'Account-Password', 'Password', 'Enter Password'));
    userInput.appendChild(createElement('button', { type: 'submit' }, 'Create Account >'));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitCredentials('/api/signup', form);
    });

    const footer = container.appendChild(createElement('div'))
        .appendChild(createElement('p', {}, 'Already have an account? '));
    footer.appendChild(createLink('Sign In', renderLogin));
}

function renderSearch() {
    wipeHTML();

    const form = container.appendChild(createElement('form'));
    const searchWrapper = form.appendChild(createElement('div'));
    searchWrapper.appendChild(createElement('input', {
        type: 'text',
        id: 'SearchBar',
        name: 'SearchBar',
        placeholder: 'Search for a card...'
    }));
    form.addEventListener('submit', (event) => event.preventDefault());

    const nav = container.appendChild(createElement('div'));
    nav.appendChild(createButton('Decks', renderDecks));
    nav.appendChild(createButton('Log Out', logOut));
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

async function logOut() {
    await fetch('/api/logout', { method: 'POST' });
    username = '';
    renderLogin();
}

async function restoreSession() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            username = (await response.json()).username;
            renderSearch();
            return;
        }
    } catch (error) {
        console.error(error);
    }
    renderLogin();
}

restoreSession();
