import React from "react";
import { BrowserRouter } from "react-router-dom";
import Main from "./components/Main";
// import About from "./components/overlays/About";
// import Contact from "./components/overlays/Contact";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Main />
      </BrowserRouter>
    </div>
  );
}

export default App;
