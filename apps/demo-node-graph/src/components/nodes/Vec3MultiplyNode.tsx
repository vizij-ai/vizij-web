import VectorOpNode from './VectorOpNode';

const Vec3MultiplyNode = (props: any) => (
    <VectorOpNode {...props} data={{...props.data, op: '*', label: 'Vector Multiply'}} />
);

export default Vec3MultiplyNode;
