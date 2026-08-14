import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase Database Config
const firebaseConfig = {
    apiKey: "AIzaSyCqwgwiukwKb7o6gwnaLoPQSWc7BfMDuYQ",
    authDomain: "besuad.firebaseapp.com",
    databaseURL: "https://besuad-default-rtdb.firebaseio.com",
    projectId: "besuad",
    storageBucket: "besuad.firebasestorage.app",
    messagingSenderId: "641705823615",
    appId: "1:641705823615:web:6502b2511ff8c0f251de4a",
    measurementId: "G-2YSX71N08Q"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let rawShikelaNewsData = {};
let rawNewNewsData = {};
let localCachedBroadcasts = [];
let currentActiveCategoryFilter = "Shikela Update";
let cardClockIntervalId = null;

const urlParams = new URLSearchParams(window.location.search);
const isAdminMode = urlParams.get('admin') === 'true';

document.addEventListener('DOMContentLoaded', () => {
    streamLiveAdminUpdatesLog();
    bindVisualInterfaceControls();
    setupSearchEngineControls();
    setupNewsReaderModalControls();

    const closeBtn = document.getElementById('closePopupBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('customPopupModule').classList.remove('show-popup');
        });
    }
    
    initiateLiveInterfaceClocks();
});

function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = String(url).trim().match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
}

function initiateLiveInterfaceClocks() {
    const cornerClockNode = document.getElementById('topCornerLiveClock');
    
    if (cardClockIntervalId) clearInterval(cardClockIntervalId);
    cardClockIntervalId = setInterval(() => {
        const now = new Date();
        
        if (cornerClockNode) {
            cornerClockNode.innerText = now.toLocaleTimeString(undefined, {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            });
        }

        const clockNodes = document.querySelectorAll('.timestamp-log-text[data-timestamp]');
        clockNodes.forEach(node => {
            const rawTime = parseInt(node.getAttribute('data-timestamp'));
            if (rawTime && !isNaN(rawTime)) {
                node.innerText = formatExactTimestampWithSeconds(rawTime);
            }
        });
    }, 1000);
}

function formatExactTimestampWithSeconds(baseEpoch) {
    const dateObj = new Date(baseEpoch);
    if (isNaN(dateObj.getTime())) return "Recent";
    return dateObj.toLocaleDateString(undefined, { 
        month: 'short', day: 'numeric', year: 'numeric' 
    }) + ' • ' + dateObj.toLocaleTimeString(undefined, { 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
}

function extractValidTimestamp(item) {
    const raw = item.timestamp || item.updatedAt || item.createdAtTimestamp || item.createdAt || item.date;

    if (typeof raw === 'number' && !isNaN(raw)) {
        return raw;
    }
    if (typeof raw === 'string') {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed > 1000000000) {
            return parsed < 100000000000 ? parsed * 1000 : parsed;
        }
        const dateParsed = new Date(raw).getTime();
        if (!isNaN(dateParsed)) {
            return dateParsed;
        }
    }
    return Date.now();
}

function rebuildAndRenderBroadcastsCache() {
    localCachedBroadcasts = [];

    // Shikela Update node
    Object.keys(rawShikelaNewsData).forEach(key => {
        const item = rawShikelaNewsData[key];
        if (typeof item === 'object' && item !== null) {
            localCachedBroadcasts.push({
                id: key,
                _dbPath: 'shikelaNews',
                ...item,
                title: item.title || item.newsTitle || "Shikela Update",
                category: item.category || "Shikela Update",
                resolvedTimestamp: extractValidTimestamp(item)
            });
        }
    });

    // Shikela Tips node
    Object.keys(rawNewNewsData).forEach(key => {
        const item = rawNewNewsData[key];
        if (typeof item === 'object' && item !== null) {
            localCachedBroadcasts.push({
                id: key,
                _dbPath: 'newNews',
                ...item,
                title: item.title || item.newsTitle || "Shikela Tip",
                category: item.category || "Shikela Tips",
                resolvedTimestamp: extractValidTimestamp(item)
            });
        }
    });

    // Sort newest first
    localCachedBroadcasts.sort((a, b) => b.resolvedTimestamp - a.resolvedTimestamp);

    renderFilteredBroadcasts();
}

function streamLiveAdminUpdatesLog() {
    const shikelaNewsRef = ref(db, 'shikelaNews');
    const newNewsRef = ref(db, 'newNews');

    onValue(shikelaNewsRef, (snapshot) => {
        rawShikelaNewsData = snapshot.exists() ? snapshot.val() : {};
        rebuildAndRenderBroadcastsCache();
    }, (error) => {
        console.error("Firebase read error (shikelaNews):", error);
    });

    onValue(newNewsRef, (snapshot) => {
        rawNewNewsData = snapshot.exists() ? snapshot.val() : {};
        rebuildAndRenderBroadcastsCache();
    }, (error) => {
        console.error("Firebase read error (newNews):", error);
    });
}

function renderEmptyState() {
    const container = document.getElementById('broadcastsContainer');
    if (!container) return;
    
    container.innerHTML = `
        <article class="featured-broadcast-card">
            <div class="badge-meta-row"><span class="spotlight-pill">Shikela Network</span></div>
            <h2 class="broadcast-title">All Systems Nominal</h2>
            <p class="broadcast-body-text">There are no updates or notices posted under <strong>${currentActiveCategoryFilter}</strong> today.</p>
        </article>
    `;
}

window.duplicateAsAdmin = async function(itemId) {
    const sourceItem = localCachedBroadcasts.find(n => n.id === itemId);
    if (!sourceItem) {
        triggerUiPopup("⚠️", "Error", "Target article to duplicate was not found.");
        return;
    }

    try {
        const clonedPayload = { ...sourceItem };
        const targetNodePath = clonedPayload._dbPath || `shikelaNews`;
        
        delete clonedPayload.id;
        delete clonedPayload._dbPath;
        delete clonedPayload.resolvedTimestamp;

        const now = Date.now();
        clonedPayload.createdAtTimestamp = now;
        clonedPayload.updatedAt = now;
        clonedPayload.timestamp = now;
        
        const currentTitle = clonedPayload.title || clonedPayload.newsTitle || "Untitled";
        clonedPayload.title = `${currentTitle} (Copy)`;

        const currentCode = clonedPayload.newsCode || clonedPayload.code || "";
        if (currentCode) {
            clonedPayload.newsCode = `${currentCode}_COPY`;
        }

        const nodeRef = ref(db, targetNodePath);
        const newRef = push(nodeRef);
        await set(newRef, clonedPayload);

        triggerUiPopup("✅", "Article Duplicated", `Successfully duplicated item into ${targetNodePath}.`);
    } catch (err) {
        console.error("Duplication failed:", err);
        triggerUiPopup("❌", "Duplication Error", "Failed to duplicate item into database.");
    }
};

function buildSingleNewsCardHTML(item) {
    const headline = item.title || item.newsTitle || "Shikela Update";
    const fullContent = item.content || item.message || "";
    const category = item.category || "Shikela Update";
    const imageUrl = item.imageUrl || item.image || "";

    const maxPreviewLen = 120;
    const isLongText = fullContent.length > maxPreviewLen;
    const previewContent = isLongText ? fullContent.substring(0, maxPreviewLen).trim() + "..." : fullContent;

    const numericalTime = item.resolvedTimestamp || Date.now();
    const initialFormattedClock = formatExactTimestampWithSeconds(numericalTime);
    
    const isTips = category.trim().toLowerCase().includes("tips");
    const pillBadgeClass = isTips ? "spotlight-pill system-badge" : "spotlight-pill";

    let imageHTML = "";
    if (imageUrl && imageUrl.trim().length > 0) {
        imageHTML = `<div class="broadcast-image-frame" onclick="openFullNewsReader('${item.id}')"><img src="${imageUrl}" onload="this.classList.add('loaded')"></div>`;
    }

    let adminBtnHTML = "";
    if (isAdminMode) {
        adminBtnHTML = `
            <div class="admin-action-row">
                <button class="admin-duplicate-btn" onclick="duplicateAsAdmin('${item.id}')">📋 Duplicate Post</button>
            </div>
        `;
    }

    return `
        ${adminBtnHTML}
        <div class="badge-meta-row">
            <div style="display:flex; align-items:center; gap:6px;">
                <span class="${pillBadgeClass}">${category}</span>
            </div>
            <span class="timestamp-log-text" data-timestamp="${numericalTime}">${initialFormattedClock}</span>
        </div>
        ${imageHTML}
        <div class="clickable-news-content" onclick="openFullNewsReader('${item.id}')">
            <h2 class="broadcast-title">${headline}</h2>
            <p class="broadcast-body-text">${previewContent}</p>
        </div>
    `;
}

window.openFullNewsReader = function(itemId) {
    const item = localCachedBroadcasts.find(n => n.id === itemId);
    if (!item) return;

    const readerOverlay = document.getElementById('fullNewsModalOverlay');
    const readerBody = document.getElementById('fullNewsReaderBody');

    if (!readerOverlay || !readerBody) return;

    const headline = item.title || item.newsTitle || "Shikela Update";
    const fullContent = item.content || item.message || "";
    const category = item.category || "Shikela Update";
    const imageUrl = item.imageUrl || item.image || "";
    const videoUrl = item.videoUrl || item.youtubeUrl || item.youtubeId || item.video || "";
    
    const isDuplicateActive = Boolean(item.duplicateCoverInArticle ?? item.duplicateImageInArticle ?? item.duplicateImage ?? true);
    
    const targetRedirectUrl = item.link || item.redirectUrl || item.url || item.targetUrl || "";
    const customActionLabel = item.actionButtonLabel || item.actionLabel || item.buttonLabel || item.btnLabel || "Visit External Source / Link";

    const numericalTime = item.resolvedTimestamp || Date.now();
    const initialFormattedClock = formatExactTimestampWithSeconds(numericalTime);
    const isTips = category.trim().toLowerCase().includes("tips");
    const pillBadgeClass = isTips ? "spotlight-pill system-badge" : "spotlight-pill";

    let imageHTML = "";
    if (imageUrl && imageUrl.trim().length > 0 && isDuplicateActive) {
        imageHTML = `<div class="reader-image-frame"><img src="${imageUrl.trim()}" alt="${headline}"></div>`;
    }

    let videoHTML = "";
    const embedUrl = getYouTubeEmbedUrl(videoUrl);
    if (embedUrl) {
        videoHTML = `
            <div class="reader-video-container">
                <iframe src="${embedUrl}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
            </div>
        `;
    }

    let redirectBtnHTML = "";
    if (targetRedirectUrl && targetRedirectUrl.trim().length > 0) {
        redirectBtnHTML = `
            <div style="margin-top:20px;">
                <a href="${targetRedirectUrl.trim()}" target="_blank" rel="noopener noreferrer" class="redirect-link-btn" style="width:100%; justify-content:center;">
                    <span>${customActionLabel}</span>
                    <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
            </div>
        `;
    }

    let adminDuplicateBtnReader = "";
    if (isAdminMode) {
        adminDuplicateBtnReader = `
            <button class="admin-duplicate-btn" style="margin-bottom: 12px; width: 100%;" onclick="duplicateAsAdmin('${item.id}')">📋 Duplicate Article Entry</button>
        `;
    }

    readerBody.innerHTML = `
        ${adminDuplicateBtnReader}
        <div class="reader-meta-bar">
            <div style="display:flex; align-items:center; gap:6px;">
                <span class="${pillBadgeClass}">${category}</span>
            </div>
            <span class="timestamp-log-text">${initialFormattedClock}</span>
        </div>
        <h1 class="reader-title">${headline}</h1>
        ${imageHTML}
        ${videoHTML}
        <div class="reader-full-body">${fullContent}</div>
        ${redirectBtnHTML}
    `;

    readerOverlay.classList.add('active-reader');
};

function setupNewsReaderModalControls() {
    const closeBtn = document.getElementById('closeNewsReaderBtn');
    const readerOverlay = document.getElementById('fullNewsModalOverlay');

    if (closeBtn && readerOverlay) {
        closeBtn.addEventListener('click', () => {
            readerOverlay.classList.remove('active-reader');
        });
    }
}

function renderFilteredBroadcasts() {
    const container = document.getElementById('broadcastsContainer');
    if (!container) return;
    
    container.innerHTML = "";

    const filtered = localCachedBroadcasts.filter(item => {
        const nodeCategory = (item.category || "").trim().toLowerCase();
        const targetFilter = currentActiveCategoryFilter.trim().toLowerCase();
        return nodeCategory === targetFilter;
    });

    if (filtered.length === 0) {
        renderEmptyState();
        return;
    }

    filtered.forEach((item) => {
        const card = document.createElement('article');
        card.className = "featured-broadcast-card";
        card.innerHTML = buildSingleNewsCardHTML(item);
        container.appendChild(card);
    });
}

function bindVisualInterfaceControls() {
    const pills = document.querySelectorAll('.filter-btn, .filter-pill');

    pills.forEach(pill => {
        pill.addEventListener('click', function() {
            pills.forEach(p => {
                p.classList.remove('active-pill');
                p.classList.remove('active');
            });
            this.classList.add('active-pill');
            this.classList.add('active');
            
            currentActiveCategoryFilter = this.getAttribute('data-filter') || this.getAttribute('data-category') || "Shikela Update";

            renderFilteredBroadcasts();
        });
    });
}

function setupSearchEngineControls() {
    const openBtn = document.getElementById('openSearchBtn');
    const closeBtn = document.getElementById('closeSearchDrawerBtn');
    const searchOverlay = document.getElementById('searchModalOverlay');
    const searchInput = document.getElementById('newsCodeSearchInput');

    if (openBtn && searchOverlay) {
        openBtn.addEventListener('click', () => {
            searchOverlay.classList.add('active-search');
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            executeNewsSearchQuery('');
        });
    }

    if (closeBtn && searchOverlay) {
        closeBtn.addEventListener('click', () => {
            searchOverlay.classList.remove('active-search');
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            executeNewsSearchQuery(e.target.value);
        });
    }
}

function executeNewsSearchQuery(query) {
    const resultsArea = document.getElementById('searchResultsArea');
    if (!resultsArea) return;

    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
        resultsArea.innerHTML = `
            <div style="text-align:center; padding:30px 20px; color:#ffffff; font-size:13px; font-weight:600;">
                Type a post code above to find updates quickly.
            </div>
        `;
        return;
    }

    const matchedNews = localCachedBroadcasts.filter(item => {
        const code = String(item.newsCode || item.code || item.id || '').toLowerCase();
        const title = String(item.title || item.newsTitle || '').toLowerCase();
        const content = String(item.content || item.message || '').toLowerCase();

        return code.includes(cleanQuery) || title.includes(cleanQuery) || content.includes(cleanQuery);
    });

    if (matchedNews.length === 0) {
        resultsArea.innerHTML = `
            <div style="text-align:center; padding:30px 20px; color:#ffffff; font-size:13px; font-weight:600;">
                No updates matching "<strong>${cleanQuery}</strong>" found.
            </div>
        `;
        return;
    }

    resultsArea.innerHTML = '';
    matchedNews.forEach((item) => {
        const card = document.createElement('article');
        card.className = "featured-broadcast-card";
        card.innerHTML = buildSingleNewsCardHTML(item);
        resultsArea.appendChild(card);
    });
}

function triggerUiPopup(icon, title, desc) {
    const overlay = document.getElementById('customPopupModule');
    const iconNode = document.getElementById('popupIconNode');
    const titleNode = document.getElementById('popupTitleNode');
    const descNode = document.getElementById('popupDescNode');
    const dismissBtn = document.getElementById('closePopupBtn');
    
    if (overlay && iconNode && titleNode && descNode) {
        if (dismissBtn) {
            dismissBtn.innerText = "Continue";
            dismissBtn.onclick = () => overlay.classList.remove('show-popup');
        }

        iconNode.innerText = icon;
        iconNode.style.display = "inline-block";
        titleNode.innerText = title;
        descNode.innerText = desc;
        overlay.classList.add('show-popup');
    }
}


