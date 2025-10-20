import './i18n';
import { BrowserRouter } from "react-router";
import Main from "./components/Main";

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
