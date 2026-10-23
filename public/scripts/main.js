let username = "";
let priceMultiplier = 1.0;

const container = document.getElementById('body');

function setPath(path) {
    if (location.pathname !== path) {
        history.pushState(null, '', path);
    }
}

function wipeHTML(path) {
    if (path) {
        setPath(path);
    }
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

function createDropdown(options, onChange) {
    const select = createElement('select');
    for (const option of options) {
        select.appendChild(createElement('option', { value: option.value }, option.text));
    }
    select.addEventListener('change', () => onChange(select.value));
    return select;
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
    return data.map((card) => {
        const images = card.image_uris ?? card.card_faces?.[0]?.image_uris;
        return {
            id: card.id,
            name: card.name,
            type: card.type_line,
            setName: card.set_name,
            manaCost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? '',
            image: images?.small ?? null,
            largeImage: images?.large ?? images?.normal ?? null,
            // Double-faced cards keep their text on each face
            faces: (card.card_faces ?? [card]).map((face) => ({
                name: face.name,
                manaCost: face.mana_cost ?? '',
                type: face.type_line ?? card.type_line,
                text: face.oracle_text ?? '',
                flavor: face.flavor_text ?? '',
                power: face.power,
                toughness: face.toughness,
                loyalty: face.loyalty
            })),
            rarity: card.rarity,
            setCode: card.set,
            collectorNumber: card.collector_number,
            artist: card.artist,
            releasedAt: card.released_at,
            prices: card.prices ?? {}
        };
    });
}

function renderAuthPage({ path, title, submitText, endpoint, footerText, linkText, onLinkClick }) {
    wipeHTML(path);
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
        path: '/login',
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
        path: '/signup',
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

function renderSettingsButton(parent = container) {
    const button = parent.appendChild(createButton('', renderSettings, 'SettingsButton'));
    // Static markup, so innerHTML is safe here; createElement can't build SVG nodes
    button.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';
    button.setAttribute('aria-label', 'Settings');
    button.title = 'Settings';
}

function renderSearch() {
    wipeHTML('/search');
    container.className = 'HasBottomNav';

    const topBar = container.appendChild(createElement('div', { class: 'TopBar' }));
    const form = topBar.appendChild(createElement('form'));
    renderSettingsButton(topBar);
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
        const item = createElement('button', { type: 'button', class: 'CardResult' });
        if (card.image) {
            item.appendChild(createElement('img', { src: card.image, alt: card.name }));
        }
        item.appendChild(createElement('p', {}, card.name));
        item.addEventListener('click', () => showCardPopup(card));
        return item;
    }));
}

function showCardPopup(card) {
    const dialog = document.body.appendChild(createElement('dialog', { class: 'CardPopup' }));
    dialog.addEventListener('close', () => dialog.remove());
    // Clicking the backdrop (the dialog element itself) closes it
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });

    const closeButton = createButton('×', () => dialog.close(), 'CardPopupClose');
    closeButton.setAttribute('aria-label', 'Close');
    dialog.appendChild(closeButton);

    const image = dialog.appendChild(createElement('div', { class: 'CardPopupImage' }));
    if (card.largeImage) {
        image.appendChild(createElement('img', { src: card.largeImage, alt: card.name }));
    }

    const info = dialog.appendChild(createElement('div', { class: 'CardPopupInfo' }));
    info.appendChild(createElement('h2', {}, card.name));
    for (const face of card.faces) {
        const section = info.appendChild(createElement('section'));
        if (card.faces.length > 1) {
            section.appendChild(createElement('h3', {}, face.name));
        }
        const heading = [face.type, face.manaCost].filter(Boolean).join(' — ');
        section.appendChild(createElement('p', { class: 'CardPopupType' }, heading));
        for (const line of face.text.split('\n').filter(Boolean)) {
            section.appendChild(createElement('p', {}, line));
        }
        if (face.flavor) {
            section.appendChild(createElement('p', { class: 'CardPopupFlavor' }, face.flavor));
        }
        if (face.power !== undefined) {
            section.appendChild(createElement('p', {}, `${face.power}/${face.toughness}`));
        }
        if (face.loyalty !== undefined) {
            section.appendChild(createElement('p', {}, `Loyalty: ${face.loyalty}`));
        }
    }

    const details = [
        ['Set', `${card.setName} (${card.setCode.toUpperCase()}) #${card.collectorNumber}`],
        ['Rarity', card.rarity],
        ['Artist', card.artist],
        ['Released', card.releasedAt],
        ['Price (USD)', card.prices.usd && `$${card.prices.usd}`],
        ['Price (USD foil)', card.prices.usd_foil && `$${card.prices.usd_foil}`]
    ].filter(([, value]) => value);
    const list = info.appendChild(createElement('dl', { class: 'CardPopupDetails' }));
    for (const [label, value] of details) {
        list.appendChild(createElement('dt', {}, label));
        list.appendChild(createElement('dd', {}, value));
    }

    dialog.showModal();
}

async function renderDecks() {
    wipeHTML('/decks');
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

    container.appendChild(createButton('+ Create Deck', createDeck, 'CreateDeckButton'));
    renderBottomNav('decks');
}

async function createDeck() {
    const response = await fetch('/api/decks', { method: 'POST' });
    if (response.status === 401) {
        return renderLogin();
    }
    renderDecks();
}

function renderDeck(ID, view) {
    wipeHTML(`/decks/${encodeURIComponent(ID)}`);
}

async function getUsdToEurRate() {
    const url = 'https://api.frankfurter.dev/v2/rate/usd/eur';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        console.log(`1 ${data.base} = ${data.rate} ${data.quote} (Date: ${data.date})`);
        return data.rate;
    } catch (error) {
        console.error('Failed to fetch rate:', error);
    }
}

function getUserSettings() {
    const response = fetch('/api/user-settings')
        .then(response => response.json())
        .then(data => {
            if (data.ok) {
                priceMultiplier = data.currency === 'EUR' ? getUsdToEurRate() : 1.0;
            } else {
                console.error('Failed to fetch user settings:', data.error);
            }
        })
        .catch(error => {
            console.error('Error fetching user settings:', error);
        });

}

function updateUserPriceMultiplier(currency) {
    switch (currency) {
        case "USD":
            priceMultiplier = 1.0;
            break;
        case "EUR":
            priceMultiplier = getUsdToEurRate();
            break;
        default:
            priceMultiplier = 1.0;
    }
}

function renderSettings() {
    wipeHTML('/settings');

    container.appendChild(createElement('h1', {}, 'Settings'));
    container.appendChild(createButton('Log Out', logOut));
    container.appendChild(createButton('Back', renderSearch));
    container.appendChild(createDropdown([{ value: "USD", text: "US Dollar" }, { value: "EUR", text: "Euro" }], (value) => {
       updateUserPriceMultiplier(value);
       fetch('/api/user-settings', {
           method: 'POST',
           headers: {
               'Content-Type': 'application/json'
           },
           body: JSON.stringify({ currency: value })
       });
   }));
}

async function logOut() {
    await fetch('/api/logout', { method: 'POST' });
    username = '';
    renderLogin();
}

function route() {
    const path = location.pathname;
    if (!username) {
        return path === '/signup' ? renderSignup() : renderLogin();
    }
    if (path === '/decks') {
        renderDecks();
    } else if (path.startsWith('/decks/')) {
        renderDeck(decodeURIComponent(path.slice('/decks/'.length)));
    } else if (path === '/settings') {
        renderSettings();
    } else {
        renderSearch();
    }
}

window.addEventListener('popstate', route);

async function restoreSession() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            username = (await response.json()).username;
        }
    } catch (error) {
        console.error(error);
    }
    const path = location.pathname;
    if (username && ['/', '/login', '/signup'].includes(path)) {
        history.replaceState(null, '', '/search');
    } else if (!username && path !== '/signup') {
        history.replaceState(null, '', '/login');
    }
    route();
}

restoreSession();
