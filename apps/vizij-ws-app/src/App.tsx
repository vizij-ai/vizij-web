import Content from "./content";
import { WsProvider } from "./ws-context";

function App() {
  return (
    <WsProvider>
      <Content />
    </WsProvider>
  );
}

export default App;
