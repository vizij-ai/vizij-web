import { AbiVizij } from "./AbiVizij";
import { BaxterVizij } from "./BaxterVizij";
import { HugoVizij } from "./HugoVizij";
import { JiboVizij } from "./JiboVizij";
import { QuoriVizij } from "./QuoriVizij";
import { TiagoVizij } from "./TiagoVizij";
import { VizijControlDemo } from "./VizijControlDemo";
import VizijLogo from "../assets/vizij.png";

function App() {
  return (
    <>
      <header className="w-full p-4 md:p-12 bg-gray-900">
        <div className="text-center p-4 md:p-8 m-2 md:m-8">
          <div className="">
            <img src={VizijLogo} alt="vizij logo" className="mx-auto h-32" />
          </div>
          <p className="text-2xl text-white mt-2 md:mt-8">
            A framework for defining, deforming, and deploying virtual faces.
          </p>
        </div>
      </header>
      <div className="w-full text-center text-black">
        <div className="w-full bg-white p-2 md:p-12">
          <h2 className="text-4xl font-bold my-2">Example Faces</h2>
          <div className="grid md:grid-cols-3 md:m-8 md:p-4 text-left text-white">
            <div className="h-60 m-1 md:m-4 my-3 md:my-8 p-1 md:p-4 shadow-lg rounded-xl bg-black ">
              <p className="text-lg font-bold m-1 p-2">Quori</p>
              <div className="">
                <QuoriVizij />
              </div>
            </div>
            <div className="h-60 m-1 md:m-4 my-3 md:my-8 p-1 md:p-4 shadow-lg rounded-xl bg-black ">
              <p className="text-lg font-bold m-1 p-2">Hugo</p>
              <div className="">
                <HugoVizij />
              </div>
            </div>
            <div className="h-60 m-1 md:m-4 my-3 md:my-8 p-1 md:p-4 shadow-lg rounded-xl bg-black ">
              <p className="text-lg font-bold m-1 p-2">Abi</p>
              <div className="">
                <AbiVizij />
              </div>
            </div>
            <div className="h-60 m-1 md:m-4 my-3 md:my-8 p-1 md:p-4 shadow-lg rounded-xl bg-black ">
              <p className="text-lg font-bold m-1 p-2">Baxter</p>
              <div className="">
                <BaxterVizij />
              </div>
            </div>
            <div className="h-60 m-1 md:m-4 my-3 md:my-8 p-1 md:p-4 shadow-lg rounded-xl bg-black ">
              <p className="text-lg font-bold m-1 p-2">Jibo</p>
              <div className="">
                <JiboVizij />
              </div>
            </div>
            <div className="h-60 m-1 md:m-4 my-3 md:my-8 p-1 md:p-4 shadow-lg rounded-xl bg-black ">
              <p className="text-lg font-bold m-1 p-2">Tiago</p>
              <div className="">
                <TiagoVizij />
              </div>
            </div>
          </div>
          <div className="my-10">
            <p>
              Thanks to{" "}
              <a
                target="_blank"
                className="underline hover:text-gray-600 cursor-pointer"
                href="https://www.linkedin.com/in/douglas-dooley-178a407b/"
              >
                Doug Dooley
              </a>{" "}
              for creating the (unofficial) faces above.
            </p>
          </div>
        </div>
        <div className="w-full bg-black p-12 text-white">
          <h2 className="text-4xl my-4 font-bold">Modify & Control</h2>
          <p>Not only can you display a face, you can modify and control it as well.</p>
          <VizijControlDemo />
        </div>
        <div className="w-full bg-white text-black p-12">
          <div className="my-16">
            <a
              className="bg-semio-blue text-black rounded-md text-2xl font-bold  p-4 md:p-8 inline-block"
              href="https://forms.gle/JNfjdyT8fY534DJJ8"
              target="_blank"
            >
              Sign Up To Learn More
            </a>
          </div>
        </div>
      </div>
      <footer></footer>
    </>
  );
}

export default App;
