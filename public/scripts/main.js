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

// got from that one website I visited like 7 years ago with a bunch of copy and paste SVG HTML lines
const EYE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function createPasswordField(labelText, id, name, placeholder) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createElement('label', { for: id }, labelText));

    const wrapper = fragment.appendChild(createElement('div', { class: 'PasswordWrapper' }));
    const input = wrapper.appendChild(createElement('input', { type: 'password', id, name, placeholder }));
    const toggle = wrapper.appendChild(createElement('button', {
        type: 'button',
        class: 'PasswordToggle',
        'aria-label': 'Show password'
    }));
    toggle.innerHTML = EYE_ICON;
    toggle.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.innerHTML = show ? EYE_OFF_ICON : EYE_ICON;
        toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
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

function createButton(text, onClick, className) {
    const button = createElement('button', className ? { type: 'button', class: className } : { type: 'button' }, text);
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

async function searchCards(query) {
    const response = await fetch(`https://api.scryfall.com/cards/search?unique=prints&q=${encodeURIComponent(query)}`);
    if (response.status === 404) {
        return [];
    }
    if (!response.ok) {
        throw new Error(`Card search failed (${response.status})`);
    }
    const { data } = await response.json();
    return data.map((card) => ({
        id: card.id,
        name: card.name,
        type: card.type_line,
        setName: card.set_name,
        manaCost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? '',
        image: (card.image_uris ?? card.card_faces?.[0]?.image_uris)?.small ?? null
    }));
}

function renderAuthPage({ title, submitText, endpoint, footerText, linkText, onLinkClick }) {
    wipeHTML();
    container.className = 'AuthPage';

    const header = container.appendChild(createElement('div', { class: 'HeaderText' }));
    header.appendChild(createElement('h1', {}, title));

    const form = container.appendChild(createElement('form'));
    const userInput = form.appendChild(createElement('div', { class: 'UserInput' }));
    userInput.appendChild(createField('Username:', 'text', 'Account-Username', 'Username', 'Username'));
    userInput.appendChild(createPasswordField('Password:', 'Account-Password', 'Password', 'Enter Password'));
    userInput.appendChild(createElement('button', { type: 'submit' }, submitText));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitCredentials(endpoint, form);
    });

    const footer = container.appendChild(createElement('p', {}, footerText));
    footer.appendChild(createLink(linkText, onLinkClick));
}

function renderLogin() {
    renderAuthPage({
        title: 'Sign into CardKeeper',
        submitText: 'Sign In',
        endpoint: '/api/login',
        footerText: 'New to CardKeeper? ',
        linkText: 'Create an account',
        onLinkClick: renderSignup
    });
}

function renderSignup() {
    renderAuthPage({
        title: 'Sign up for CardKeeper',
        submitText: 'Create Account >',
        endpoint: '/api/signup',
        footerText: 'Already have an account? ',
        linkText: 'Sign In',
        onLinkClick: renderLogin
    });
}

function renderBottomNav(active) {
    const nav = container.appendChild(createElement('nav', { class: 'BottomNav' }));
    const search = nav.appendChild(createButton('Search', renderSearch));
    const decks = nav.appendChild(createButton('Decks', renderDecks));
    const current = active === 'search' ? search : decks;
    current.className = 'Active';
    current.setAttribute('aria-current', 'page');
}

function renderSettingsButton() {
    container.appendChild(createButton('Settings', renderSettings, 'SettingsButton'));
}

function renderSearch() {
    wipeHTML();
    container.className = 'HasBottomNav';
    renderSettingsButton();

    const form = container.appendChild(createElement('form'));
    const searchWrapper = form.appendChild(createElement('div'));
    searchWrapper.appendChild(createElement('input', {
        type: 'text',
        id: 'SearchBar',
        name: 'SearchBar',
        placeholder: 'Search for a card...'
    }));
    const results = container.appendChild(createElement('div', { class: 'CardResults' }));
    let searchTimer;
    let latestQuery = '';
    const runSearch = async () => {
        const query = form.elements['SearchBar'].value.trim();
        latestQuery = query;
        if (!query) {
            results.replaceChildren();
            return;
        }
        await renderCardResults(results, query, () => query === latestQuery);
    };
    form.elements['SearchBar'].addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, 600); // API has a max rate of 500 MS
    });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        clearTimeout(searchTimer);
        runSearch();
    });

    renderBottomNav('search');
}

async function renderCardResults(results, query, isCurrent) {
    results.replaceChildren(createElement('p', {}, 'Searching...'));

    let cards;
    try {
        cards = await searchCards(query);
    } catch (error) {
        console.error(error);
        if (isCurrent()) {
            results.replaceChildren(createElement('p', { class: 'FormError' }, 'Search failed, try again'));
        }
        return;
    }

    if (!isCurrent()) {
        return;
    }

    if (!cards.length) {
        results.replaceChildren(createElement('p', {}, 'No cards found'));
        return;
    }
    results.replaceChildren(...cards.map((card) => {
        const item = createElement('div', { class: 'CardResult' });
        if (card.image) {
            item.appendChild(createElement('img', { src: card.image, alt: card.name }));
        }
        item.appendChild(createElement('p', {}, card.name));
        item.appendChild(createElement('small', {}, card.type));
        item.appendChild(createElement('small', {}, card.setName));
        return item;
    }));
}

async function renderDecks() {
    wipeHTML();
    container.className = 'HasBottomNav';
    renderSettingsButton();

    const response = await fetch('/api/decks');
    if (response.status === 401) {
        return renderLogin();
    }
    const { decks = [] } = await response.json();

    const list = container.appendChild(createElement('div', { class: 'DeckList' }));
    if (!decks.length) {
        list.appendChild(createElement('p', {}, 'No decks yet'));
    }
    for (const deck of decks) {
        list.appendChild(createButton(deck.name, () => renderDeck(deck.key), 'DeckBox'));
    }

    renderBottomNav('decks');
}

function renderDeck(ID, view) {
    wipeHTML();
}

function renderSettings() {
    wipeHTML();

    container.appendChild(createElement('h1', {}, 'Settings'));
    container.appendChild(createButton('Log Out', logOut));
    container.appendChild(createButton('Back', renderSearch));
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
