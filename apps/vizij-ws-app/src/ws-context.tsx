import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

interface WsContextType {
  isConnected: boolean;
  port: number;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
}

const WsContext = createContext<WsContextType | undefined>(undefined);

export const useWsContext = (): WsContextType => {
  const context = useContext(WsContext);
  if (!context) {
    throw new Error("useWsContext must be used within a WsProvider");
  }
  return context;
};

interface WsProviderProps {
  children: ReactNode;
}

export const WsProvider = ({ children }: WsProviderProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [port, setPort] = useState(9000);

  // Get port and start server on mount
  useEffect(() => {
    const init = async () => {
      try {
        const configuredPort = await invoke<number>("get_port");
        setPort(configuredPort);

        // Start the WebSocket server
        await invoke("start_ws_server");
      } catch (error) {
        console.error("Failed to initialize WS server:", error);
      }
    };

    init();
  }, []);

  // Listen for server events
  useEffect(() => {
    const unlistenStarted = listen<number>("ws:started", (event) => {
      console.log("WebSocket server started on port:", event.payload);
      setPort(event.payload);
      setIsConnected(true);
    });

    const unlistenStopped = listen("ws:stopped", () => {
      console.log("WebSocket server stopped");
      setIsConnected(false);
    });

    return () => {
      unlistenStarted.then((f) => f());
      unlistenStopped.then((f) => f());
    };
  }, []);

  const startServer = async () => {
    try {
      await invoke("start_ws_server");
    } catch (error) {
      console.error("Failed to start WS server:", error);
    }
  };

  const stopServer = async () => {
    try {
      await invoke("stop_ws_server");
    } catch (error) {
      console.error("Failed to stop WS server:", error);
    }
  };

  const value = {
    isConnected,
    port,
    startServer,
    stopServer,
  };

  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
};
