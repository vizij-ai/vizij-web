import { AbiVizij } from "./AbiVizij";
import { BaxterVizij } from "./BaxterVizij";
import { HugoVizij } from "./HugoVizij";
import { JiboVizij } from "./JiboVizij";
import { QuoriVizij } from "./QuoriVizij";
import { TiagoVizij } from "./TiagoVizij";
import { VizijControlDemo } from "./VizijControlDemo";
import VizijLogo from "../assets/VIZIJ.png";

function App() {
  return (
    <>
      <header className="w-full p-12 bg-gray-900">
        <div className="text-center p-8 m-8">
          <div className="">
            <img src={VizijLogo} alt="vizij logo" className="mx-auto h-32" />
          </div>
          <p className="text-2xl text-white mt-8">
            A framework for defining, deforming, and deploying virtual visages.
          </p>
        </div>
      </header>
      <div className="w-full text-center text-white">
        <div className="w-full bg-gray-800 p-12">
          <h2 className="text-semio-orange text-4xl font-bold">Example Vizijs</h2>

          <div className="grid md:grid-cols-3 m-8 p-4">
            <div className="h-36 m-4 my-8 p-4">
              <p className="text-lg font-bold">Quori</p>
              <QuoriVizij />
            </div>
            <div className="h-36 m-4 my-8 p-4">
              <p className="text-lg font-bold">Hugo</p>
              <HugoVizij />
            </div>
            <div className="h-36 m-4 my-8 p-4">
              <p className="text-lg font-bold">Abi</p>
              <AbiVizij />
            </div>
            <div className="h-36 m-4 my-8 p-4">
              <p className="text-lg font-bold">Baxter</p>
              <BaxterVizij />
            </div>
            <div className="h-36 m-4 my-8 p-4">
              <p className="text-lg font-bold">Jibo</p>
              <JiboVizij />
            </div>
            <div className="h-36 m-4 my-8 p-4">
              <p className="text-lg font-bold">Tiago</p>
              <TiagoVizij />
            </div>
          </div>
          <div className="my-10">
            <p>
              Thanks to{" "}
              <a target="_blank" className="underline hover:text-gray-200">
                Doug Dooley
              </a>{" "}
              for creating the (unofficial) vizijs above.
            </p>
          </div>
        </div>
        <div className="w-full bg-gray-900 p-12">
          <h2 className="text-semio-orange text-4xl my-4 font-bold">Modify & Control</h2>
          <p>Not only can you display the vizijs, you can modify and control them.</p>
          <VizijControlDemo />
        </div>
        {/* <div className="w-full bg-gray-900 p-4">
        <h2 className="text-semio-orange text-4xl my-4 font-bold">Design Your Own</h2>
      </div> */}
        <div className="w-full bg-gray-800 p-12">
          <h2 className="text-semio-orange text-4xl my-4 font-bold">Sign Up</h2>
        </div>
      </div>
      <footer></footer>
    </>
  );
}

export default App;
