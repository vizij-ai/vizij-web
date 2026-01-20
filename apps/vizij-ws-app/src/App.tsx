import { createVizijStore, VizijContext } from "vizij";
import { useMemo } from "react";
import Content from "./content";
import { WsProvider } from "./ws-context";

function App() {
  const store = useMemo(() => createVizijStore(), []);

  return (
    <WsProvider>
      <VizijContext.Provider value={store}>
        <Content />
      </VizijContext.Provider>
    </WsProvider>
  );
}

export default App;
