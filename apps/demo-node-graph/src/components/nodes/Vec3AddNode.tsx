import VectorOpNode from "./VectorOpNode";

const Vec3AddNode = (props: any) => (
  <VectorOpNode {...props} data={{ ...props.data, op: "+", label: "Vector Add" }} />
);

export default Vec3AddNode;
