let username = "";
let currency = 'USD';
let usdToEurRate = null;

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

function sendJSON(url, method, body) {
    return fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
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
    const response = await sendJSON(endpoint, 'POST', {
        username: form.elements['Username'].value,
        password: form.elements['Password'].value
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
    await loadCurrency();
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
    return data.map(mapCard);
}

function mapCard(card) {
    const images = card.image_uris ?? card.card_faces?.[0]?.image_uris;
    return {
        id: card.id,
        name: card.name,
        type: card.type_line,
        setName: card.set_name,
        manaCost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? '',
        image: images?.small ?? null,
        largeImage: images?.large ?? images?.normal ?? null,
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
}

const SCRYFALL_BATCH_SIZE = 75;

async function fetchCardsByIds(ids) {
    const cards = [];
    for (let i = 0; i < ids.length; i += SCRYFALL_BATCH_SIZE) {
        if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const identifiers = ids.slice(i, i + SCRYFALL_BATCH_SIZE).map((id) => ({ id }));
        const response = await sendJSON('https://api.scryfall.com/cards/collection', 'POST', { identifiers });
        if (!response.ok) {
            throw new Error(`Card lookup failed (${response.status})`);
        }
        cards.push(...(await response.json()).data.map(mapCard));
    }
    return cards;
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

const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6"/></svg>';

function renderBottomNav(active) {
    const nav = container.appendChild(createElement('nav', { class: 'BottomNav' }));
    const search = nav.appendChild(createButton('', renderSearch));
    search.setAttribute('aria-label', 'Search');
    search.innerHTML = SEARCH_ICON;
    const decks = nav.appendChild(createButton('', renderDecks));
    decks.setAttribute('aria-label', 'Decks');
    decks.appendChild(createElement('span', { class: 'DecksIcon' }));
    const current = active === 'search' ? search : decks;
    current.className = 'Active';
    current.setAttribute('aria-current', 'page');
}

const SETTINGS_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';

function renderSettingsButton(parent = container) {
    const button = parent.appendChild(createButton('', renderSettings, 'SettingsButton'));
    button.innerHTML = SETTINGS_ICON;
    button.setAttribute('aria-label', 'Settings');
    button.title = 'Settings';
}

function renderSearch() {
    wipeHTML('/search');
    container.className = 'HasBottomNav';

    const topBar = container.appendChild(createElement('div', { class: 'TopBar' }));
    const results = createElement('div', { class: 'CardResults' });
    topBar.appendChild(createSearchForm(results));
    renderSettingsButton(topBar);
    container.appendChild(results);

    renderBottomNav('search');
}

function createSearchForm(results, onAdd) {
    const form = createElement('form');
    const searchWrapper = form.appendChild(createElement('div'));
    searchWrapper.appendChild(createElement('input', {
        type: 'text',
        id: 'SearchBar',
        name: 'SearchBar',
        placeholder: 'Search for a card...'
    }));
    let searchTimer;
    let latestQuery = '';
    const runSearch = async () => {
        const query = form.elements['SearchBar'].value.trim();
        latestQuery = query;
        if (!query) {
            results.replaceChildren();
            return;
        }
        await renderCardResults(results, query, () => query === latestQuery, onAdd);
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
    return form;
}

function createCardResult(card, onAdd) {
    const item = createElement('button', { type: 'button', class: 'CardResult' });
    if (card.image) {
        item.appendChild(createElement('img', { src: card.image, alt: card.name }));
    }
    item.addEventListener('click', () => showCardPopup(card));
    if (!onAdd) {
        return item;
    }

    const wrapper = createElement('div', { class: 'CardResultWrapper' });
    wrapper.appendChild(item);
    const count = wrapper.appendChild(createElement('span', { class: 'AddedCount' }));
    const add = wrapper.appendChild(createButton('+', async () => {
        add.disabled = true;
        const quantity = await onAdd(card);
        add.disabled = false;
        if (quantity) {
            count.textContent = `×${quantity}`;
        }
    }, 'AddCardButton'));
    add.setAttribute('aria-label', `Add ${card.name} to deck`);
    return wrapper;
}

async function renderCardResults(results, query, isCurrent, onAdd) {
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
    results.replaceChildren(...cards.map((card) => createCardResult(card, onAdd)));
}

function createDialog(className) {
    const dialog = document.body.appendChild(createElement('dialog', { class: className }));
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });

    const closeButton = createButton('×', () => dialog.close(), 'CardPopupClose');
    closeButton.setAttribute('aria-label', 'Close');
    dialog.appendChild(closeButton);
    return dialog;
}

function showAddCardsPopup(onAdd) {
    const dialog = createDialog('SearchPopup');

    const results = createElement('div', { class: 'CardResults' });
    const bar = dialog.appendChild(createElement('div', { class: 'TopBar' }));
    const form = bar.appendChild(createSearchForm(results, onAdd));
    bar.appendChild(dialog.querySelector('.CardPopupClose'));
    dialog.appendChild(results);

    dialog.showModal();
    form.elements['SearchBar'].focus();
}

function showDeleteDeckPopup(deckKey) {
    const dialog = createDialog('ConfirmPopup');
    dialog.appendChild(createElement('p', {}, 'Delete this deck and all its cards? This cannot be undone.'));

    const actions = dialog.appendChild(createElement('div', { class: 'ConfirmActions' }));
    actions.appendChild(createButton('Cancel', () => dialog.close()));
    actions.appendChild(createButton('Delete', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        const response = await fetch(`/api/decks/${encodeURIComponent(deckKey)}`, { method: 'DELETE' });
        if (response.status === 401) {
            dialog.close();
            return renderLogin();
        }
        if (!response.ok) {
            button.disabled = false;
            dialog.appendChild(createElement('p', { class: 'FormError' }, 'Could not delete deck'));
            return;
        }
        dialog.close();
        renderDecks();
    }, 'ConfirmDelete'));

    dialog.showModal();
}

function showCardPopup(card) {
    const dialog = createDialog('CardPopup');

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
        ['Price', formatPrice(card.prices.usd)],
        ['Price (foil)', formatPrice(card.prices.usd_foil)]
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
    for (const deck of decks) {
        const box = list.appendChild(createButton(deck.name, () => renderDeck(deck.key), 'DeckBox'));
        box.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            renameDeck(deck, box);
        });
    }

    container.appendChild(createButton('+ Create Deck', createDeck, 'CreateDeckButton'));
    renderBottomNav('decks');
}

function renameDeck(deck, box) {
    const input = createElement('input', { type: 'text', class: 'DeckNameInput', maxlength: '100' });
    input.value = deck.name;
    const { width, height } = box.getBoundingClientRect();
    input.style.width = `${width}px`;
    input.style.height = `${height}px`;
    box.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = async (save) => {
        if (done) {
            return;
        }
        done = true;
        const name = input.value.trim();
        if (save && name && name !== deck.name) {
            const response = await sendJSON(`/api/decks/${encodeURIComponent(deck.key)}`, 'PATCH', { name });
            if (response.status === 401) {
                return renderLogin();
            }
            if (response.ok) {
                deck.name = name;
            }
        }
        box.textContent = deck.name;
        input.replaceWith(box);
    };
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            finish(true);
        } else if (event.key === 'Escape') {
            finish(false);
        }
    });
    input.addEventListener('blur', () => finish(true));
}

async function createDeck() {
    const response = await fetch('/api/decks', { method: 'POST' });
    if (response.status === 401) {
        return renderLogin();
    }
    renderDecks();
}

const VIEW_ICONS = {
    list: '<path d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z"/>',
    cards: '<path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/>'
};

const TRASH_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

const DECK_VIEW_COOKIE = 'deckView';

function readDeckView() {
    const match = document.cookie.match(new RegExp(`(?:^|; )${DECK_VIEW_COOKIE}=(list|cards)`));
    return match ? match[1] : 'cards';
}

function saveDeckView(view) {
    document.cookie = `${DECK_VIEW_COOKIE}=${view}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function createDeckCard(card, quantity, onChange) {
    const wrapper = createElement('div', { class: 'DeckCardWrapper' });
    const item = wrapper.appendChild(createElement('button', { type: 'button', class: 'DeckCard' }));
    if (card.image) {
        item.appendChild(createElement('img', { src: card.image, alt: card.name }));
    }
    item.appendChild(createElement('span', { class: 'DeckCardName' }, card.name));
    item.addEventListener('click', () => showCardPopup(card));

    const controls = wrapper.appendChild(createElement('div', { class: 'DeckCardControls' }));
    const step = (delta) => async () => {
        minus.disabled = plus.disabled = true;
        await onChange(card, delta);
        minus.disabled = plus.disabled = false;
    };
    const minus = controls.appendChild(createButton('-', step(-1), 'DeckCardStep'));
    controls.appendChild(createElement('span', { class: 'DeckCardCount' }, String(quantity)));
    const plus = controls.appendChild(createButton('+', step(1), 'DeckCardStep'));
    minus.setAttribute('aria-label', `Remove one ${card.name}`);
    plus.setAttribute('aria-label', `Add one ${card.name}`);
    return wrapper;
}

function setDeckCard(cards, card, quantity, onChange) {
    const existing = cards.querySelector(`[data-card-id="${card.id}"]`);
    if (!quantity) {
        existing?.remove();
    } else if (existing) {
        existing.querySelector('.DeckCardCount').textContent = String(quantity);
    } else {
        cards.appendChild(createDeckCard(card, quantity, onChange)).dataset.cardId = card.id;
    }
}

async function changeCardQuantity(deckKey, cardId, delta) {
    const url = `/api/decks/${encodeURIComponent(deckKey)}/cards`;
    const response = delta > 0
        ? await sendJSON(url, 'POST', { cardId })
        : await fetch(`${url}/${encodeURIComponent(cardId)}`, { method: 'DELETE' });
    if (response.status === 401) {
        renderLogin();
    }
    return response.ok ? (await response.json()).quantity : null;
}

async function renderDeck(ID, view = readDeckView()) {
    wipeHTML(`/decks/${encodeURIComponent(ID)}`);

    const toolbar = container.appendChild(createElement('div', { class: 'DeckToolbar' }));
    toolbar.appendChild(createButton('← Back', renderDecks, 'BackButton'));

    const toggle = toolbar.appendChild(createElement('div', { class: 'ViewToggle', role: 'group', 'aria-label': 'Deck view' }));
    const deleteButton = toolbar.appendChild(createButton('', () => showDeleteDeckPopup(ID), 'DeleteDeckButton'));
    deleteButton.setAttribute('aria-label', 'Delete deck');
    deleteButton.title = 'Delete deck';
    deleteButton.innerHTML = TRASH_ICON;
    const cards = container.appendChild(createElement('div', { class: `DeckCards ${view}View` }));
    for (const [name, label] of [['list', 'List view'], ['cards', 'Card view']]) {
        const button = toggle.appendChild(createButton('', () => {
            toggle.querySelector('.Active')?.classList.remove('Active');
            button.classList.add('Active');
            cards.className = `DeckCards ${name}View`;
            saveDeckView(name);
        }, name === view ? 'Active' : ''));
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">${VIEW_ICONS[name]}</svg>`;
    }

    const changeQuantity = async (card, delta) => {
        const quantity = await changeCardQuantity(ID, card.id, delta);
        if (quantity !== null) {
            setDeckCard(cards, card, quantity, changeQuantity);
        }
        return quantity;
    };
    const addButton = container.appendChild(createButton('+', () => {
        showAddCardsPopup((card) => changeQuantity(card, 1));
    }, 'AddToDeckButton'));
    addButton.setAttribute('aria-label', 'Add cards');
    addButton.title = 'Add cards';

    const response = await fetch(`/api/decks/${encodeURIComponent(ID)}/cards`);
    if (response.status === 401) {
        return renderLogin();
    }
    if (!response.ok) {
        return;
    }
    try {
        const { cards: entries } = await response.json();
        const quantities = new Map(entries.map((entry) => [entry.id, entry.quantity]));
        for (const card of await fetchCardsByIds([...quantities.keys()])) {
            setDeckCard(cards, card, quantities.get(card.id), changeQuantity);
        }
    } catch (error) {
        console.error(error);
        cards.appendChild(createElement('p', { class: 'FormError' }, 'Could not load cards'));
    }
}

async function getUsdToEurRate() {
    try {
        const response = await fetch('https://api.frankfurter.dev/v2/rate/usd/eur');
        if (!response.ok) {
            throw new Error(`Rate lookup failed (${response.status})`);
        }
        return (await response.json()).rate;
    } catch (error) {
        console.error('Failed to fetch rate:', error);
    }
}

async function setCurrency(newCurrency) {
    if (newCurrency === 'EUR' && !usdToEurRate) {
        usdToEurRate = await getUsdToEurRate();
    }
    currency = newCurrency === 'EUR' && usdToEurRate ? 'EUR' : 'USD';
}

async function loadCurrency() {
    try {
        const response = await fetch('/api/user-settings');
        if (response.ok) {
            await setCurrency((await response.json()).currency);
        }
    } catch (error) {
        console.error('Error fetching user settings:', error);
    }
}

function formatPrice(usd) {
    if (!usd) {
        return '';
    }
    return currency === 'EUR' ? `€${(usd * usdToEurRate).toFixed(2)}` : `$${usd}`;
}

const CURRENCY_OPTIONS = [
    { value: 'USD', text: 'US Dollar' },
    { value: 'EUR', text: 'Euro' }
];

function renderSettings() {
    wipeHTML('/settings');
    container.className = 'SettingsPage';

    const back = container.appendChild(createButton('←', renderSearch, 'BackButton'));
    back.setAttribute('aria-label', 'Back');
    back.title = 'Back';

    container.appendChild(createElement('h1', {}, 'Settings'));
    const dropdown = container.appendChild(createDropdown(CURRENCY_OPTIONS, async (value) => {
        await setCurrency(value);
        sendJSON('/api/user-settings', 'POST', { currency: value });
    }));
    dropdown.value = currency;
    container.appendChild(createButton('Credits', showCreditsPopup));
    container.appendChild(createButton('Log Out', logOut));
}

function createExternalLink(href, text, title) {
    return createElement('a', { href, title, target: '_blank', rel: 'noopener' }, text);
}

function showCreditsPopup() {
    const dialog = createDialog('ConfirmPopup');
    dialog.appendChild(createElement('h2', {}, 'Credits'));

    const icons = dialog.appendChild(createElement('p'));
    icons.appendChild(createExternalLink(
        'https://www.flaticon.com/free-icons/cards',
        'Cards icons created by Unknown Depths - Flaticon',
        'cards icons'
    ));

    const cards = dialog.appendChild(createElement('p', {}, 'Card data and images from '));
    cards.appendChild(createExternalLink('https://scryfall.com', 'Scryfall'));

    const rates = dialog.appendChild(createElement('p', {}, 'Exchange rates from '));
    rates.appendChild(createExternalLink('https://frankfurter.dev', 'Frankfurter'));

    dialog.showModal();
}

async function logOut() {
    await fetch('/api/logout', { method: 'POST' });
    username = '';
    currency = 'USD';
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
            await loadCurrency();
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
