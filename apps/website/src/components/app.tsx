import { AbiVizij, AbiVizijWithControls } from "./AbiVizij";
import { BaxterVizij } from "./BaxterVizij";
import { HugoVizij, HugoVizijWithControls } from "./HugoVizij";
import { JiboVizij } from "./JiboVizij";
import { QuoriVizij, QuoriVizijWithControls } from "./QuoriVizij";
import { TiagoVizij } from "./TiagoVizij";
import { VizijControlDemo } from "./VizijControlDemo";

function App() {
  return (
    <>
      <header className="w-full p-12 bg-black">
        <div className="text-center">
          <h1 className="text-semio-blue text-8xl">vizij</h1>
          <p className="text-normal text-white mt-8">
            A framework for defining, deforming, and deploying virtual visages.
          </p>
        </div>
      </header>
      <div className="w-full text-center text-white">
        <div className="w-full bg-gray-800 p-4">
          <h2 className="text-semio-orange text-4xl my-4">Example Vizijs</h2>
          <p className="text-sm">
            Thanks to{" "}
            <a target="_blank" className="underline hover:text-gray-200">
              Doug Dooley
            </a>{" "}
            for creating the (unofficial) vizijs below.
          </p>
          <div className="grid md:grid-cols-3">
            <div className="h-36 m-4 p-2">
              <p>Quori</p>
              <QuoriVizij />
            </div>
            <div className="h-36 m-4 p-2">
              <p>Hugo</p>
              <HugoVizij />
            </div>
            <div className="h-36 m-4 p-2">
              <p>Abi</p>
              <AbiVizij />
            </div>
            <div className="h-36 m-4 p-2">
              <p>Baxter</p>
              <BaxterVizij />
            </div>
            <div className="h-36 m-4 p-2">
              <p>Jibo</p>
              <JiboVizij />
            </div>
            <div className="h-36 m-4 p-2">
              <p>Tiago</p>
              <TiagoVizij />
            </div>
          </div>
        </div>
        <div className="w-full bg-black p-4">
          <h2 className="text-semio-orange text-4xl my-4">Modify & Control</h2>
          <p>Not only can you display the vizijs, you can modify and control them.</p>
          <VizijControlDemo />
        </div>
        {/* <div className="w-full bg-black p-4">
        <h2 className="text-semio-orange text-4xl my-4">Design Your Own</h2>
      </div> */}
        <div className="w-full bg-gray-800 p-4">
          <h2 className="text-semio-orange text-4xl my-4">Sign Up</h2>
        </div>
      </div>
      <footer></footer>
    </>
  );
}

export default App;
