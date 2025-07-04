import { Vizij } from "vizij";

interface CharacterViewProps {
  name: string;
  rootId: string;
}

export const CharacterView = ({ name, rootId }: CharacterViewProps) => {
  return (
    <div>
      <p>{name}</p>
      <div>
        <Vizij rootId={rootId} />
      </div>
    </div>
  );
};
