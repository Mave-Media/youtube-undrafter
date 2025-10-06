// ==UserScript==
// @name         YouTube Optimizer REWORK (Vanilla JS)
// @version      2.0
// @description  Patch YouTube Studio undrafting modals + helpers (no jQuery, no external requires)
// @author       Mave
// @match        https://studio.youtube.com/*
// @grant        none
// @run-at       document-end
// @noframes
// @namespace    https://mave.media
// @updateURL    https://raw.githubusercontent.com/Mave-Media/youtube-undrafter/main/undrafter.user.js
// @downloadURL  https://raw.githubusercontent.com/Mave-Media/youtube-undrafter/main/undrafter.user.js
// ==/UserScript==

(() => {
  "use strict";

  /***********************
   * Bootstrap guards
   ***********************/
  if (window.top !== window.self) return;
  if (window.__MAVE_YT_OPT_V2__) return;
  window.__MAVE_YT_OPT_V2__ = true;
  console.log("[MAVE YT OPT] bootstrap guards passed");

  /***********************
   * Small utilities
   ***********************/
  let prevCountBeforeThis = 0;
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  const click = (el) => { if (el) el.click(); };
  const setStyle = (el, styles={}) => { if (!el) return; Object.assign(el.style, styles); };
    function paint(el, color) {
  if (el) el.style.backgroundColor = color;
}
  const hasChildren = (el) => !!(el && el.children && el.children.length);
  const textIncludes = (el, text) => !!(el && el.textContent && el.textContent.includes(text));
  const make = (tag, props = {}, children = []) => {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k,v]) => {
      if (k === "style" && v && typeof v === "object") Object.assign(el.style, v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v);
    });
    children.forEach(c => el.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return el;
  };
  const ensure = (id, createFn) => {
    let el = qs("#" + id);
    if (!el) el = createFn();
    return el;
  };

  // Clipboard copy with fallback
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("input");
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
    } catch (e) {
      console.warn("Clipboard copy failed:", e);
    }
  }

    const txtEq = (el, t) =>
  !!(el && el.textContent && el.textContent.trim().toLowerCase() === t.toLowerCase());

function findCloseButton(root=document) {
  return (
    root.querySelector('#close-button') ||
    root.querySelector('ytcp-icon-button[aria-label="Close"]') ||
    [...root.querySelectorAll('ytcp-button, tp-yt-paper-button, button')]
      .find(b => txtEq(b, 'close') || b.getAttribute?.('aria-label') === 'Close')
  );
}

/** Dismisses "Video published" (and similar) modal if present. */
function dismissVideoPublished() {
  const modals = [
    ...document.querySelectorAll('ytcp-dialog, tp-yt-paper-dialog, [role="dialog"]')
  ];

  for (const m of modals) {
    if (!m.isConnected) continue;

    const tc = (m.textContent || '').toLowerCase();
    const looksLikeShare =
      tc.includes('video published') ||
      tc.includes('share a link') ||
      tc.includes('video link') ||
      tc.includes('promote this video') ||
      tc.includes('visibility');

    if (looksLikeShare) {
      const btn = findCloseButton(m);
      if (btn) { btn.click(); return true; }
    }
  }
  return false;
}

// --- Close only the "Video published" share dialog (not the edit wizard) ---
function isShareDialog(node) {
  if (!node || !node.isConnected) return false;
  // Must be a dialog-ish container
  const isDialog = node.matches?.('ytcp-dialog, tp-yt-paper-dialog, [role="dialog"]');
  if (!isDialog) return false;

  const text = (node.textContent || '').toLowerCase();

  // Positive signals this is the share dialog
  const looksLikeShare =
    text.includes('video published') &&
    (text.includes('share a link') || text.includes('video link') || text.includes('promote this video'));

  if (!looksLikeShare) return false;

  // Require a YouTube link in the dialog to be extra sure
  const hasYouTubeLink =
    node.querySelector('a[href*="youtu."]') ||
    node.querySelector('input[value*="youtu."]') ||
    node.querySelector('textarea[value*="youtu."]');

  if (!hasYouTubeLink) return false;

  // Guard: if the dialog has Next/Done buttons, it's the edit wizard, don't close
  const hasWizardButtons = node.querySelector('#next-button, #done-button');
  if (hasWizardButtons) return false;

  return true;
}

function closeShareDialogOnce() {
  // Look for any open dialogs and close the one that matches our heuristic
  const dialogs = document.querySelectorAll('ytcp-dialog, tp-yt-paper-dialog, [role="dialog"]');
  for (const d of dialogs) {
    if (!isShareDialog(d)) continue;
    // Prefer a close button inside the dialog
    let closeBtn =
      d.querySelector('#close-button') ||
      d.querySelector('ytcp-icon-button[aria-label="Close"]') ||
      [...d.querySelectorAll('ytcp-button, tp-yt-paper-button, button')]
        .find(b => (b.textContent || '').trim().toLowerCase() === 'close' ||
                   b.getAttribute?.('aria-label') === 'Close');

    if (!closeBtn) {
      // Fallback: try a dialog-scope dismiss
      closeBtn = document.querySelector('ytcp-icon-button[aria-label="Close"], #close-button');
    }

    if (closeBtn) {
      closeBtn.click();
      return true;
    }
  }
  return false;
}

    // Close the "Video published" share dialog that appears after Done
function closeVideoPublishedPopup(onFinish) {
  const timeoutAt = Date.now() + 4000; // try up to ~4s
  const tryClose = () => {
    // Find any Studio dialog(s)
    const dialogs = document.querySelectorAll('tp-yt-paper-dialog, ytcp-dialog, [role="dialog"]');
    for (const d of dialogs) {
      const heading = d.querySelector('h1, #dialog-title');
      if (!heading) continue;

      const title = (heading.textContent || '').trim().toLowerCase();
      // match your screenshot: "Video published"
      if (!/video published/i.test(title)) continue;

      // we found the share dialog; hit its Close
      const closeBtn =
        d.querySelector('#close-button button, #close-button, #close-icon-button, [aria-label="Close"]');

      if (closeBtn) {
        closeBtn.click();
        if (onFinish) setTimeout(() => onFinish(true), 50);
        return;
      }
    }

    if (Date.now() < timeoutAt) {
      setTimeout(tryClose, 120);
    } else {
      if (onFinish) onFinish(false);
    }
  };

  tryClose();
}

    // climb N parents (you use this elsewhere)
function parentN(el, n) {
  let p = el;
  for (let i = 0; i < n && p; i++) p = p.parentElement;
  return p || null;
}

// wait until the grid is back and draft buttons exist
async function waitForGrid(timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (document.querySelectorAll(".edit-draft-button:not([hidden])").length) return true;
    await sleep(150);
  }
  return false;
}

    // wait until there are no dialogs/wizard screens
async function waitForNoDialog(timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const anyDialog = document.querySelector('tp-yt-paper-dialog, ytcp-dialog, [role="dialog"]');
    const wizardUp = document.querySelector('#next-button, #done-button');
    if (!anyDialog && !wizardUp) return true;
    await sleep(150);
  }
  return false;
}

// wait until the editor for a video is mounted
async function waitForEditor(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // the “Details” step always has this toggle; the wizard also has Next/Done
    if (document.querySelector('#toggle-button') || document.querySelector('#next-button')) return true;
    await sleep(150);
  }
  return false;
}

    async function waitUntilCountDropsThenFinish(prev, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // grid visible?
    const anyGridBtn = document.querySelector('.edit-draft-button:not([hidden])');
    const count = anyGridBtn ? document.querySelectorAll('.edit-draft-button:not([hidden])').length : 0;

    // proceed as soon as we *both* see the grid and the count is smaller
    if (anyGridBtn && count < prev) break;

    await sleep(200);
  }
  finishUndraft();
}

  /***********************
   * Global state
   ***********************/
  let draftButtons = qsa(".edit-draft-button:not([hidden])");
  const liveDrafts = () => qsa(".edit-draft-button:not([hidden])").length;
  let aantalDrafts = liveDrafts();
  let undrafted = 0;
  let toUndraft = aantalDrafts - undrafted;
  let undraftError = false;
  let undraftErrorCount = 0;
  let settingsError = false;
  const settingsErrorType = [];
  let stopError = false;
  const stopErrorType = [];

  /***********************
   * UI Builders (createHtmlElements.js → vanilla, Trusted-Types safe)
   ***********************/
  function createElements() {
    // Containers
    const undraftButton = ensure("undraftButton", () => {
      const root = make("div", { id: "undraftButton" }, [
        make("p", { textContent: "Undraft videos" })
      ]);
      document.body.prepend(root);
      return root;
    });

    const vidTable = ensure("vidTable", () => {
      const table = make("table", { id: "videoTable" });
      const root = make("div", { id: "vidTable" }, [table]);
      document.body.prepend(root);
      return root;
    });

    const maximizer = ensure("maximizer", () => {
      const root = make("div", { id: "maximizer", textContent: "▼" });
      document.body.prepend(root);
      return root;
    });

    const refresher = ensure("refresher", () => {
      const img = make("img", {
        src: "https://www.svgrepo.com/show/59665/refresh-button.svg",
        height: 26, width: 26, alt: "refresh"
      });
      const root = make("div", { id: "refresher" }, [img]);
      document.body.prepend(root);
      return root;
    });

    const wrongSettings = ensure("wrongSettings", () => {
      const root = make("div", { id: "wrongSettings" }, [
        make("h2", { textContent: "Wrong Settings Detected!" })
      ]);
      document.body.prepend(root);
      return root;
    });

    const stopErrorBox = ensure("stopError", () => {
      const root = make("div", { id: "stopError" }, [
        make("h2", { textContent: "Critical Error Detected!" })
      ]);
      document.body.prepend(root);
      return root;
    });

    const newChannelPopup = ensure("newChannelPopup", () => {
      const close = make("div", { id: "closeNCP", textContent: "x" });
      const root = make("div", { id: "newChannelPopup" }, [
        close,
        make("h2", { textContent: "New Channel Detected" }),
        make("p", { textContent: "Create Channel in Assets" }),
        make("p", { textContent: "Configure Channel Settings" }),
        make("p", { textContent: "Change Channel Picture & Banner" }),
      ]);
      document.body.prepend(root);
      return root;
    });

    // Styles
    setStyle(undraftButton, {
      position: "absolute", zIndex: "3000", textAlign: "center", border: "2px solid",
      cursor: "pointer", width: "150px", right: "250px", backgroundColor: "lightgreen",
      fontSize: "14px", fontFamily: "verdana", display: "block"
    });

    setStyle(wrongSettings, {
      position: "absolute", zIndex: "3000", textAlign: "center", border: "2px solid",
      width: "450px", right: "404px", backgroundColor: "orange", fontSize: "20px",
      fontFamily: "verdana", display: "none", padding: "6px"
    });

    setStyle(stopErrorBox, {
      position: "absolute", zIndex: "3001", textAlign: "center", border: "2px solid",
      width: "450px", right: "858px", backgroundColor: "red", fontSize: "20px",
      fontFamily: "verdana", display: "none", color: "white", padding: "6px"
    });

    setStyle(vidTable, {
      display: "none", position: "absolute", backgroundColor: "white", zIndex: "50",
      left: "250px", fontSize: "15px", border: "2px solid", padding: "5px",
      fontFamily: "monospace"
    });

    setStyle(maximizer, {
      fontSize: "20px", width: "26px", textAlign: "center", left: "220px", height: "24px",
      border: "2px solid", position: "absolute", zIndex: "50", cursor: "pointer",
      backgroundColor: "white", display: "block"
    });

    setStyle(refresher, {
      fontSize: "20px", width: "26px", textAlign: "center", left: "220px", top: "30px",
      height: "26px", border: "2px solid", position: "absolute", zIndex: "50",
      cursor: "pointer", display: "none", backgroundColor: "white"
    });

    setStyle(newChannelPopup, {
      position: "absolute", zIndex: "2500", textAlign: "center", border: "2px solid",
      width: "450px", left: "10px", top: "10px", padding: "10px",
      backgroundColor: "#ff6dfb", fontSize: "20px", fontFamily: "verdana",
      display: "none"
    });

    const closeNCP = qs("#closeNCP");
    setStyle(closeNCP, {
      position: "absolute", zIndex: "2501", textAlign: "center", width: "24px",
      right: "0px", top: "0px", fontSize: "20px", fontWeight: "bold", fontFamily: "verdana",
      display: "block", cursor: "pointer"
    });
  }

  /***********************
   * Video grid helpers (from ytoptimizer.js)
   ***********************/
  function youtubeLetsGo() {
    if (window.__MAVE_YT_OPT_V2_STARTED__) return;
    window.__MAVE_YT_OPT_V2_STARTED__ = true;
    console.log("[MAVE YT OPT] youtubeLetsGo() starting");

    function logIntro() {
      console.log("YouTube Studio Upload Optimizer V2.0 - Vanilla JS - Let's Go!");
    }

    function checkWelcome() {
      if (qs("#welcome-dialog")) {
        const popup = qs("#newChannelPopup");
        if (popup) popup.style.display = "block";
      }
    }

    function setHovers(cls) {
      const rows = qsa(`.${cls} .group`);
      rows.forEach(cell => {
        cell.addEventListener("mouseover", () => {
          qsa(`.${cls} .videoName`).forEach(el => el.style.fontWeight = "bold");
          qsa(`.${cls} .group`).forEach(el => el.style.fontWeight = "bold");
        });
        cell.addEventListener("mouseleave", () => {
          qsa(`.${cls} .videoName`).forEach(el => el.style.fontWeight = "normal");
          qsa(`.${cls} .group`).forEach(el => el.style.fontWeight = "normal");
        });
      });
    }

    function setElementProperties() {
      if (setElementProperties.__ran) return;
      setElementProperties.__ran = true;

      let maximini = false;
      let firstTime = true;

      qs("#maximizer")?.addEventListener("click", () => {
        const vt = qs("#vidTable");
        const mx = qs("#maximizer");
        if (!vt || !mx) return;

        if (maximini) {
          vt.style.display = "none";
          maximini = false;
          mx.textContent = "▼";
        } else {
          vt.style.display = "block";
          if (firstTime) {
            getLinks();
            const r = qs("#refresher");
            if (r) r.style.display = "block";
            firstTime = false;
          }
          maximini = true;
          mx.textContent = "▲";
        }
      });

      qs("#refresher")?.addEventListener("click", () => {
        const table = qs("#videoTable");
        if (table) table.textContent = ""; // clear safely
        getLinks();
      });

      qs("#undraftButton")?.addEventListener("click", () => {
        undraft(true);
      });

      qs("#closeNCP")?.addEventListener("click", () => {
        qs("#newChannelPopup")?.remove();
      });

      function getLinks() {
        const videoIDS = [];
        const videoNames = [];
        const vidGroups = [];
        const groupClasses = [];

        let selectedColor = 0;
        const colors = ["lightblue", "orange", "lightgreen", "yellow"];
        const table = qs("#videoTable");
        if (!table) return;

        qsa("ytcp-img-with-fallback div img").forEach(img => {
          let thisID = "";
          const src = img.getAttribute("src") || "";
          if (src.includes("/vi_webp/")) {
            // /vi_webp/<ID>/
            thisID = src.substring(29, 40);
          } else {
            // /vi/<ID>/
            thisID = src.substring(24, 35);
          }
          let thisName = (img.getAttribute("alt") || "").substring(16);

          if (thisID && !videoIDS.includes(thisID)) {
            videoIDS.push(thisID);
            videoNames.push(thisName);
          }
        });

videoIDS.forEach((val, index) => {
  const name = videoNames[index] || "";
  const parts = name.trim().split(/\s+/);
  let country = "wh";

  if (parts.length >= 3) {
    country = parts[2].toLowerCase();
  }

  const lastSpace = name.lastIndexOf(" ");
  const nameTillV = lastSpace > -1 ? name.substring(0, lastSpace) : name;

  let vidGroup = vidGroups.indexOf(nameTillV);
  if (vidGroup === -1) {
    vidGroups.push(nameTillV);
    vidGroup = vidGroups.indexOf(nameTillV);
    groupClasses.push("group" + vidGroup);
    selectedColor++;
    if (selectedColor > colors.length - 1) selectedColor = 0;
  }

  const row = make("tr", { className: `group${vidGroup}` });
  const tdFlag = make("td", { className: "flag" }, [
    make("img", { src: `https://flagcdn.com/w20/${country}.png`, alt: country })
  ]);
  const tdName = make("td", { className: "click2copy videoName", textContent: name });
  const tdLink = make("td", { className: "click2copy vidLink" });
  tdLink.style.paddingLeft = "20px";
  tdLink.appendChild(document.createTextNode(`https://youtu.be/${val}`));
  const tdId = make("td", { className: "vidID", textContent: val });
  tdId.style.paddingLeft = "30px";
  tdId.style.paddingRight = "20px";
  const tdGroup = make("td", { className: "group" });
  tdGroup.setAttribute("value", String(vidGroup));
  tdGroup.style.backgroundColor = colors[selectedColor];
  tdGroup.style.minWidth = "20px";

  row.append(tdFlag, tdName, tdLink, tdId, tdGroup);
  table.appendChild(row);
});

        // Interactions
        qsa(".click2copy").forEach(cell => {
          cell.style.cursor = "pointer";
          cell.addEventListener("click", async function () {
            const linkCell = this.parentElement.querySelector(".vidLink");
            if (!linkCell) return;
            const current = getComputedStyle(linkCell).backgroundColor;
            linkCell.style.backgroundColor = (current === "rgb(255, 192, 203)") ? "lightblue" : "pink";
            const text = linkCell.textContent.trim();
            await copyToClipboard(text);
          });
        });

        qsa(".group").forEach(cell => {
          cell.style.cursor = "pointer";
          cell.addEventListener("click", async function () {
            const group2copy = this.getAttribute("value");
            let bundle = "";
            qsa(".group").forEach(g => {
              if (g.getAttribute("value") === group2copy) {
                const linkCell = g.parentElement.querySelector(".vidLink");
                if (linkCell) {
                  bundle += linkCell.textContent.trim();
                }
                const row = g.parentElement;
                row.style.opacity = "0";
                setTimeout(() => { row.style.opacity = "1"; }, 500);
              }
            });
            await copyToClipboard(bundle);
          });
        });

        qsa(".vidID").forEach(cell => {
          cell.style.cursor = "pointer";
          cell.addEventListener("click", async function () {
            const idCell = this.parentElement.querySelector(".vidID");
            if (!idCell) return;
            const current = getComputedStyle(idCell).backgroundColor;
            idCell.style.backgroundColor = (current === "rgb(255, 192, 203)") ? "lightblue" : "pink";
            const text = idCell.textContent.trim();
            await copyToClipboard(text);
          });
        });

        qsa("#videoTable tr").forEach(tr => {
          tr.addEventListener("mouseenter", () => tr.style.background = "lightGrey");
          tr.addEventListener("mouseleave", () => tr.style.background = "white");
        });

        const vt = qs("#videoTable");
        if (vt) {
          vt.style.borderSpacing = "0px";
          vt.style.margin = "5px";
          qsa("#videoTable td").forEach(td => td.style.margin = "2px");
          qsa(".flag").forEach(f => { f.style.width = "14px"; f.style.height = "14px"; f.style.paddingRight = "5px"; });
          qsa(".vidID").forEach(v => v.style.paddingLeft = "30px");
          qsa(".vidLink").forEach(v => v.style.paddingLeft = "30px");
        }

        // Set hover groups
        groupClasses.forEach(setHovers);
      }

      logIntro();
      // Ensure UI exists before wiring
      createElements();
      // Wire events + table
      setElementProperties.__ran = false; // in case Studio nuked listeners earlier
    }

    setElementProperties();
    checkWelcome();
  }

  /***********************
   * Undrafter logic (from undrafter.js)
   ***********************/
  function clickNext() {
    click(qs("#next-button"));
  }
  function clickFirstDraftButton() {
    const btn = qsa(".edit-draft-button:not([hidden])")[0];
    click(btn);
  }

  async function pageOne() {
    checkMFK(0);
    click(qs("#toggle-button"));
    setTimeout(() => {
      checkAlteredContent(0);
      checkFeaturedPlaces(0);
      checkAutomticConcepts(0);
      checkEmbed(0);
      checkSubscribers(0);
      checkShortsRemixing(0);
      checkCommentsRatings(0);
      checkShowLikes(0);
    }, 150);
    setTimeout(clickNext, 650);
    setTimeout(pageTwo, 800);
  }

  async function pageTwo() {
    setTimeout(clickNext, 150);
    setTimeout(pageThree, 200);
  }

  async function pageThree() {
    setTimeout(clickNext, 150);
    setTimeout(pageFour, 200);
  }

function pageFour() {
  checkVisibility(0);
  setTimeout(() => click(qs("#done-button")), 250);

  // After Done, close the share popup, then wait for the grid count to drop.
  setTimeout(() => {
    closeVideoPublishedPopup(() => {
      // if the wizard still shows a Close button, click it — otherwise we’ll just wait for the grid.
      const closeBtn =
        document.querySelector('ytcp-button#close-button button') ||
        document.querySelector('ytcp-button#close-button');
      if (closeBtn) closeBtn.click();

      // proceed as soon as the list reflects one fewer draft
      waitUntilCountDropsThenFinish(prevCountBeforeThis);
    });
  }, 600);
}

function pageOverview(attempt = 0) {
  if (checkStopErrors()) return;

  // 1) If the share dialog is somehow still open, try to close it again.
  const shareOpen = !!document.querySelector('tp-yt-paper-dialog h1, #dialog-title');
  if (shareOpen && /video published/i.test((document.querySelector('tp-yt-paper-dialog h1, #dialog-title')?.textContent || '').trim())) {
    closeVideoPublishedPopup(() => setTimeout(() => pageOverview(attempt + 1), 120));
    return;
  }

  // 2) Try to close the editor/wizard (the "Close" button in the footer of the publish flow)
  const closeBtn =
    document.querySelector('ytcp-button#close-button button') ||
    document.querySelector('ytcp-button#close-button') ||
    document.querySelector('[aria-label="Close"].style-scope.ytcp-video-share-dialog'); // fallback

  if (closeBtn) {
    paint(closeBtn, "pink");
    closeBtn.click();
    setTimeout(finishUndraft, 200);
    return;
  }

  // 3) Fallback: if we can’t find a close button after a few tries, assume we’re already back
  // on the table and move on so the next draft gets processed.
  if (attempt < 20) {
    setTimeout(() => pageOverview(attempt + 1), 200);
  } else {
    // last-resort: proceed
    setTimeout(finishUndraft, 100);
  }
}

function finishUndraft() {
  undrafted++;
  toUndraft = liveDrafts(); // what remains right now
  updateToUndraftLiveView(undrafted, toUndraft);

  if (toUndraft > 0) {
    setTimeout(() => undrafter(), 400);
  } else {
    finalize();
  }
}

function startNextUndraft() { setTimeout(() => undrafter(), 500); }
  function restartCurrentUndraft() { undrafter(); }

  function updateToUndraftLiveView(x, y) {
    const a = qs("#undrafted"); const b = qs("#toUndraft");
    if (a) a.textContent = `Videos undrafted: ${x}`;
    if (b) b.textContent = `Videos to undraft: ${y}`;
  }

  function finalize() {
    if (liveDrafts() < 1) {
      if (!settingsError && !stopError) window.location.href = "https://www.youtube.com/feed/my_videos";
    } else {
      undraft(false);
    }
  }

  function checkMFK(aantalChecks) {
    const rb = qs("tp-yt-paper-radio-button[name='VIDEO_MADE_FOR_KIDS_NOT_MFK']");
    if (aantalChecks < 3) {
      if (rb?.getAttribute("aria-checked") === "true") {
        paint(rb, "green"); return;
      } else {
        paint(rb, "red"); click(qs("tp-yt-paper-radio-button[name='VIDEO_MADE_FOR_KIDS_NOT_MFK'] #offRadio"));
        settingsError = true;
        if (!settingsErrorType.includes("MFK")) settingsErrorType.push("MFK");
        checkMFK(aantalChecks + 1);
      }
    } else { stopError = true; stopErrorType.push("MFK"); }
  }

  function checkAlteredContent(aantalChecks) {
    const rb = qs("tp-yt-paper-radio-button[name='VIDEO_HAS_ALTERED_CONTENT_NO']");
    if (aantalChecks < 3) {
      if (rb?.getAttribute("aria-checked") === "true") { paint(rb, "green"); return; }
      paint(rb, "red");
      click(qs("tp-yt-paper-radio-button[name='VIDEO_HAS_ALTERED_CONTENT_NO'] #offRadio"));
      settingsError = true;
      if (!settingsErrorType.includes("AlteredContent")) settingsErrorType.push("AlteredContent");
      checkAlteredContent(aantalChecks + 1);
    } else { stopError = true; stopErrorType.push("AlteredContent"); }
  }

  function checkFeaturedPlaces(aantalChecks) {
    const box = qs("#has-autoplaces-mentioned-checkbox #checkbox");
    if (!box) return; // silently ignore if missing
    if (aantalChecks < 3) {
      if (hasChildren(box)) {
        click(box);
        setTimeout(() => checkFeaturedPlaces(aantalChecks + 1), 100);
      } else {
        const host = parentN(box, 4);
        paint(host, "green");
      }
    } else { stopError = true; stopErrorType.push("FeaturedPlaces"); }
  }

  function checkAutomticConcepts(aantalChecks) {
    // Find the label element with text 'Allow automatic concepts'
    const labelDiv = qsa("div.label").find(el => textIncludes(el, "Allow automatic concepts"));
    const toggleHost = labelDiv ? parentN(labelDiv, 2) : null; // original uses parent().parent()
    const clickable = toggleHost ? toggleHost.parentElement : null; // original clicked parent().parent().parent()

    if (aantalChecks < 3) {
      const isChecked = toggleHost?.hasAttribute("checked");
      if (isChecked) {
        click(clickable);
        setTimeout(() => checkAutomticConcepts(aantalChecks + 1), 100);
      } else {
        paint(clickable, "green");
      }
    } else { stopError = true; stopErrorType.push("AutomticConcepts"); }
  }

  function checkEmbed(aantalChecks) {
    const box = qs("#allow-embed #checkbox");
    if (!box) return;
    if (aantalChecks < 3) {
      if (hasChildren(box)) {
        click(box);
        setTimeout(() => checkEmbed(aantalChecks + 1), 100);
      } else {
        paint(parentN(box, 4), "green");
      }
    } else { stopError = true; stopErrorType.push("Embed"); }
  }

  function checkSubscribers(aantalChecks) {
    const box = qs("#notify-subscribers #checkbox");
    if (!box) return;
    if (aantalChecks < 3) {
      if (hasChildren(box)) {
        click(box);
        setTimeout(() => checkSubscribers(aantalChecks + 1), 100);
      } else {
        paint(parentN(box, 4), "green");
      }
    }
  }

  function checkShortsRemixing(aantalChecks) {
    const rb = qs("tp-yt-paper-radio-button#visual-opt-out-radio-button");
    if (!rb) return;
    if (aantalChecks < 3) {
      if (rb.getAttribute("aria-checked") === "true") { paint(rb, "green"); return; }
      paint(rb, "red"); click(rb);
      settingsError = true;
      if (!settingsErrorType.includes("ShortsRemix")) settingsErrorType.push("ShortsRemix");
      checkShortsRemixing(aantalChecks + 1);
    } else { stopError = true; stopErrorType.push("ShortsRemix"); }
  }

  function checkCommentsRatings(aantalChecks) {
    const rb = qs(".comment-moderation #off-radio-button");
    if (!rb) return;
    if (aantalChecks < 3) {
      if (rb.getAttribute("aria-checked") === "true") { paint(rb, "green"); return; }
      paint(rb, "red"); click(rb);
      settingsError = true;
      if (!settingsErrorType.includes("ShortsRemix")) settingsErrorType.push("ShortsRemix"); // preserved from original
      checkShortsRemixing(aantalChecks + 1);
    } else { stopError = true; stopErrorType.push("ShortsRemix"); }
  }

  function checkShowLikes(aantalChecks) {
    const box = qs("ytcp-form-checkbox[label='Show how many viewers like this video']");
    if (!box) return;
    const isChecked = box.getAttribute("aria-checked") === "true" || box.children?.[0]?.getAttribute("aria-checked") === "true";
    if (aantalChecks < 3) {
      if (!isChecked) { paint(box, "green"); return; }
      paint(box, "red"); click(box);
      settingsError = true;
      if (!settingsErrorType.includes("ShowLikes")) settingsErrorType.push("ShowLikes");
      checkCommentsRatings(aantalChecks + 1);
    } else { stopError = true; stopErrorType.push("ShowLikes"); }
  }

  function checkVisibility(aantalChecks) {
    const rb = qs("tp-yt-paper-radio-button[name='UNLISTED']");
    if (!rb) return;
    if (aantalChecks < 3) {
      if (rb.getAttribute("aria-selected") === "true") {
        paint(rb, "green");
      } else {
        paint(rb, "red"); click(qs("tp-yt-paper-radio-button[name='UNLISTED'] #offRadio"));
        settingsError = true;
        if (!settingsErrorType.includes("Visibility")) settingsErrorType.push("Visibility");
        checkVisibility(aantalChecks + 1);
      }
    } else { stopError = true; stopErrorType.push("Visibility"); }
  }

  function safeAppendTextLine(host, id, text) {
    if (!host) return;
    if (qs("#" + id)) return;
    const p = make("p", { id, textContent: text });
    host.appendChild(p);
  }

  function displaySettingErrors() {
    const host = qs("#wrongSettings");
    if (!host) return;
    safeAppendTextLine(host, "noReloadMsg", "page will not reload after completing undrafts!");

    settingsErrorType.forEach(item => {
      switch (item) {
        case "MFK":              safeAppendTextLine(host, "MFKErrorMsg", "- Set To Not Made For Kids"); break;
        case "AlteredContent":   safeAppendTextLine(host, "AlteredContentErrorMsg", "- Disable AlteredContent"); break;
        case "FeaturedPlaces":   safeAppendTextLine(host, "FeaturedPlacesErrorMsg", "- Disable FeaturedPlaces"); break;
        case "AutomticConcepts": safeAppendTextLine(host, "AutomticConceptsErrorMsg", "- Disable AutomticConcepts"); break;
        case "Embed":            safeAppendTextLine(host, "EmbedErrorMsg", "- Disable Embed"); break;
        case "ShortsRemix":      safeAppendTextLine(host, "ShortsRemixErrorMsg", "- Disable ShortsRemix"); break;
        case "CommentsRatings":  safeAppendTextLine(host, "CommentsRatingsErrorMsg", "- Disable Comments Ratings"); break;
        case "ShowLikes":        safeAppendTextLine(host, "ShowLikesErrorMsg", "- Disable ShowLikes"); break;
        case "Visibility":       safeAppendTextLine(host, "VisibilityErrorMsg", "- Set Default Visibilty to Unlisted"); break;
      }
    });
  }

  function checkStopErrors() {
    if (stopError) {
      displayStopErrors();
      return true;
    }
    return false;
  }

  function displayStopErrors() {
    const host = qs("#stopError");
    if (!host) return;
    safeAppendTextLine(host, "stopErrorMsg", "undrafting stopped!");

    settingsErrorType.forEach(item => {
      switch (item) {
        case "MFK":        safeAppendTextLine(host, "MFKStopMsg", "- Could not set Not Made For Kids"); break;
        case "Embed":      safeAppendTextLine(host, "EmbedStopMsg", "- Could not turn off Embedding"); break;
        case "Shorts":     safeAppendTextLine(host, "ShortsStopMsg", "- Could not turns off Shorts"); break;
        case "Comments":   safeAppendTextLine(host, "CommentsStopMsg", "- Could not Disable Comments"); break;
        case "Ratings":    safeAppendTextLine(host, "RatingsStopMsg", "- Could not Disable User Ratings"); break;
        case "Visibility": safeAppendTextLine(host, "VisibilityStopMsg", "- Could not set Visibilty to Unlisted"); break;
      }
    });
  }

  function checkContent() { return !!qs("#toggle-button"); }

async function undrafter() {
  // count before opening this draft
  prevCountBeforeThis = liveDrafts();

  const btn = document.querySelector('.edit-draft-button:not([hidden])');
  if (!btn) { finalize(); return; }

  try { btn.scrollIntoView({ block: 'center' }); } catch {}
  btn.click();
  setTimeout(pageOne, 500);
}


  function undraft(firstTime) {
    aantalDrafts = liveDrafts();
     toUndraft = liveDrafts();
    console.log("aantal drafts = " + aantalDrafts);
    qsa(".edit-draft-button").forEach(b => paint(b, "pink"));
    draftButtons = qsa(".edit-draft-button:not([hidden])");
    if (firstTime) undrafted = 0;
    undraftError = false;

    const btn = qs("#undraftButton");

    // live counters (Trusted-Types safe)
    const ensureLabel = (id, text) => {
      let el = qs("#" + id);
      if (!el) {
        el = make("p", { id, textContent: text });
        btn && btn.appendChild(el);
      } else {
        el.textContent = text;
      }
    };

    if (firstTime) {
      ensureLabel("totalUndraft", `Undrafting ${toUndraft} videos`);
      ensureLabel("undrafted", `Videos undrafted: ${undrafted}`);
      ensureLabel("toUndraft", `Videos to undraft: ${toUndraft}`);
      undrafter();
    } else {
      ensureLabel("totalUndraftRestart", `Restart > Undrafting ${toUndraft} videos`);
      updateToUndraftLiveView(undrafted, toUndraft);
      undrafter();
    }
  }

  /***********************
   * Bootstrap (no jQuery) + Resilience
   ***********************/
  (function boot() {
    const start = () => {
      try {
        if (!document.body) return;
        // Ensure UI exists before anything else
        createElements();
        youtubeLetsGo();
      } catch (e) {
        console.error("[MAVE YT OPT] init error", e);
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }

    // Backup kicks to beat SPA swaps
    setTimeout(start, 1500);
    setTimeout(start, 4000);

    // Watchdog: if Studio nukes our nodes, recreate
    const mo = new MutationObserver(() => {
      if (!qs("#undraftButton") || !qs("#maximizer") || !qs("#refresher")) {
        // rebuild minimal UI, then re-pin
        try {
          createElements();
        } catch (e) {
          console.warn("[MAVE YT OPT] watchdog rebuild failed", e);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // tiny debug helpers
    window._maveDebug = {
      ping: () => {
        const ok = !!(qs("#undraftButton") && qs("#maximizer") && qs("#refresher"));
        console.log("[MAVE YT OPT] ping", ok);
        return ok;
      },
      recreate: () => { createElements(); }
    };
  })();
})();
