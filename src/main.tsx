import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorCatcher from "./ErrorCatcher";

// import { QUESTIONS } from "./Questions";
// (window as any).__QUESTIONS__ = QUESTIONS;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorCatcher>
      <App />
    </ErrorCatcher>
  </React.StrictMode>
);

