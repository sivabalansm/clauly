import * as React from "react";
import { useState } from "react";
import DevHarness from "./DevHarness";
import ProductionPane from "./ProductionPane";

interface AppProps {
  title: string;
}

const App: React.FC<AppProps> = (_props: AppProps) => {
  const [view, setView] = useState<"production" | "dev">("production");

  if (view === "dev") {
    return <DevHarness />;
  }

  return <ProductionPane onSwitchToDevTools={() => setView("dev")} />;
};

export default App;
