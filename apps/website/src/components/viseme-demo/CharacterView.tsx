import { Vizij } from "@vizij/render";

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
