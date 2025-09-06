import VectorOpNode from "./VectorOpNode";

const Vec3SubtractNode = (props: any) => (
  <VectorOpNode {...props} data={{ ...props.data, op: "-", label: "Vector Subtract" }} />
);

export default Vec3SubtractNode;
