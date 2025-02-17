import React, { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import Main from "./components/Main";

function App() {

  useEffect(() => {
    const onResize = (event) => console.info("resize", event);

    window.visualViewport.addEventListener('resize', onResize);

    return () => {
      window.visualViewport.removeEventListener('resize', onResize);
    }
  }, []);

  return (
    <>
      <div className="App">
        <BrowserRouter>
          <Main />
        </BrowserRouter>
      </div>
      <div style={{ height: "300px" }}>hi</div>
    </>
  );
}

export default App;
