import React, { useRef, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./components/Home";
import About from "./components/overlays/About";
import Share from "./components/overlays/Share";
import Contact from "./components/overlays/Contact";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
          <Routes>
            <Route element={<Home />} path="*">
              <Route
                path="about"
                element={<About />}
              />
              <Route
                path="contact"
                element={<Contact />}
              />
              <Route
                path="share"
                element={<Share />}
              />
              <Route
                path="*"
                element={<Navigate to="/" />}
              />
            </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
