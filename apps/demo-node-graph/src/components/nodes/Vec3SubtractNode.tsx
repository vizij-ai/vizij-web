import VectorOpNode from "./VectorOpNode";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Vec3SubtractNode = (props: any) => (
  <VectorOpNode {...props} data={{ ...props.data, op: "-", label: "Vector Subtract" }} />
);

export default Vec3SubtractNode;
