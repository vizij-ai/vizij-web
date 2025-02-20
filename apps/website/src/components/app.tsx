import { AbiVizijWithContext } from "./AbiVizij";
import { HugoVizijWithContext } from "./HugoVizij";
import { QuoriVizijWithContext } from "./QuoriVizij";

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
            for creating and animating the vizijs below.
          </p>
          <div>
            <h3 className="text-xl text-semio-yellow m-2">Meet Quori</h3>
            <p>Quori .... </p>
            <div className="h-64">
              <QuoriVizijWithContext />
            </div>
          </div>
          <div>
            <h3 className="text-xl text-semio-yellow m-2">Meet Hugo</h3>
            <p>
              The Hugo face below is the forthcoming default{" "}
              <a
                href="https://peerbots.org"
                target="_blank"
                className="underline hover:text-gray-200"
              >
                Peerbots
              </a>{" "}
              screen-based face.
            </p>
            <HugoVizijWithContext />
          </div>
          <div>
            <h3 className="text-xl text-semio-yellow m-2">Meet Abi</h3>
            <p>
              The below vizij is a replica face of{" "}
              <a
                href="https://www.dromeda.com.au/product"
                target="_blank"
                className="underline hover:text-gray-200"
              >
                Andromeda's Abi
              </a>{" "}
              robot.
            </p>
            <AbiVizijWithContext />
          </div>
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
