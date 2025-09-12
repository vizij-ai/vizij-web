import VectorOpNode from './VectorOpNode';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Vec3MultiplyNode = (props: any) => (
    <VectorOpNode {...props} data={{...props.data, op: '*', label: 'Vector Multiply'}} />
);

export default Vec3MultiplyNode;
