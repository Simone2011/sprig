import { dispatch } from "../dispatch.js";
import { loadFromURL } from "./loadFromURL.js"
import { createEditorView } from "../codemirror/cm.js";
import { addEvents } from "../events.js";
import { highlightError } from "./logError.js";
import { sizeGameCanvas } from "./sizeGameCanvas.js"

function getParam(key) {
  const search = new URLSearchParams(window.location.search);
  return search.get(key);
}

function removeParam(key) {
  return;
  
  const url = new URL(window.location);
  url.searchParams.delete(key);

  // Can we clear param without adding history
  window.history.pushState({}, null, url);
}

export async function init(args, state) {
  dispatch("RENDER");

  state.codemirror = createEditorView((update) => {
    highlightError(state);
    
    if (!update.docChanged) return;
    if (state.newDocument) {
      state.newDocument = false;
      return;
    }

    const rerender = !state.stale || !state.staleRun;
    state.stale = true;
    state.staleRun = true;
    if (rerender) dispatch("RENDER");
  });
  
  state.codemirror.dom.id = "code-editor";
  document.querySelector("#code-editor").replaceWith(state.codemirror.dom);

  addEvents(state);

  const savedString = window.localStorage.getItem("puzzle-lab") || "[]";
  state.savedGames = JSON.parse(savedString);

  const set = text => dispatch("SET_EDITOR_TEXT", { text, range: [0, 0] });
  const lastGameName = window.localStorage.getItem("last-game");
  const lastGame = state.savedGames.find(([name]) => name === lastGameName)
  if (lastGame) {
    state.newDocument = true;
    set(lastGame[1]);
  } else {
    const link = "https://raw.githubusercontent.com/hackclub/sprig/main/games/getting_started.js";
    state.newDocument = true;
    set(await fetch(link).then(x => x.text()));
  }

  window.addEventListener("error", (err) => {
    // this is a hack to cut down on this chrome bug: https://support.google.com/chrome/thread/165732696/typing-in-console-triggers-error?hl=en
    if (err.message.includes("Uncaught EvalError")) return;

    dispatch("LOG_ERROR", { type: "page", err });
  });

  const file = getParam("file");
  removeParam("file");
  if (file) {
    const text = await loadFromURL(file);

    const changes = {
      from: 0,
      to: state.codemirror.state.doc.toString().length,
      insert: text
    };

    state.codemirror.dispatch({ changes })
  }

  const id = getParam("id");
  removeParam("id");
  if (id) {
    const url = `https://project-bucket-hackclub.s3.eu-west-1.amazonaws.com/${id}.json`
    const json = await fetch(url, { mode: "cors" }).then((r) => r.json());
    const text = json.text;

    const changes = {
      from: 0,
      to: state.codemirror.state.doc.toString().length,
      insert: text
    };

    state.codemirror.dispatch({ changes });
  }

  // fold all tagged template literals
  setTimeout(() => {
    const text = state.codemirror.state.doc.toString();
    const matches = text.matchAll(/(map|bitmap|tune)`[\s\S]*?`/g);
    for (const match of matches) {
      const index = match.index;
      state.codemirror.foldRange(index, index+1);
    }
  }, 100);

  const container = document.querySelector(".game-canvas-container");
  new ResizeObserver(sizeGameCanvas).observe(container);

  document.querySelector(".game-canvas").focus();

  const md = await fetch("https://raw.githubusercontent.com/hackclub/sprig/main/docs/docs.md").then(res => res.text());
  const mdRenderer = document.querySelector("markdown-renderer");
  mdRenderer.innerHTML = md;

  const DEFAULT_DOCS_PERCENTAGE = "0%";
  const docsPerc = localStorage.getItem("docs-percentage") || DEFAULT_DOCS_PERCENTAGE;
  document.documentElement.style.setProperty("--docs-percentage", docsPerc);
  document.querySelector(".docs").classList.toggle("docs-expanded", docsPerc.trim() !== "0%");

  dispatch("RENDER");

  // switch to mobile mode
  const mobile = isMobile();
  if (mobile) {
    const text = state.codemirror.state.doc.toString(); 
    console.log(text);
    dispatch("RENDER_MOBILE", { text });
  }
}

const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
