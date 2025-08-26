import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import HWIDAuth from "./components/HWIDAuth";
import { AuthProvider } from "./contexts/AuthContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <HWIDAuth>
        <App />
      </HWIDAuth>
    </AuthProvider>
  </React.StrictMode>,
);
