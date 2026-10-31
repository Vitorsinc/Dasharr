import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/archivo/wdth.css";
import "./styles.css";
import { writeLog } from "./lib/tauri";
import { errorMessage } from "./lib/errors";

window.addEventListener("error", (e) => writeLog("error", `Error no controlado: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => writeLog("error", `Promesa rechazada: ${errorMessage(e.reason)}`));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
