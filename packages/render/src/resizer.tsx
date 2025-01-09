import { memo, useRef, useEffect, type RefObject, type ReactNode } from "react";
import { useSpringValue, animated } from "@react-spring/web";

function InnerResizer({
  height,
  width,
  children,
}: {
  height: number;
  width: number;
  children: ReactNode;
}) {
  const rootRef = useRef<SVGGElement>() as RefObject<SVGGElement>;
  const transformSpring = useSpringValue<string>(`scale(1) translate(0 0)`, {
    config: { tension: 180, friction: 12 },
  });

  // Refresh the bounds and fit the camera to the scene after a delay.
  useEffect(() => {
    setTimeout(() => {
      // bounds.refresh().clip().fit();
      if (!width || !height) return;
      const bboxOrig = rootRef.current?.getBBox() ?? {
        x: 0,
        y: 0,
        width,
        height,
      };
      const bbox = {
        x: bboxOrig.x,
        y: bboxOrig.y,
        width: bboxOrig.width === 0 ? width : bboxOrig.width,
        height: bboxOrig.height === 0 ? height : bboxOrig.height,
      };

      // get the aspect ratio of the root
      const rootAspectRatio = width / height;
      // get the aspect ratio of the group
      const groupAspectRatio = bbox.width / bbox.height;
      // get the new height/width based on the aspect ratio of the root and group
      const newHeight = rootAspectRatio > groupAspectRatio ? height : width / groupAspectRatio;
      const newWidth = rootAspectRatio > groupAspectRatio ? height * groupAspectRatio : width;

      // get the zoom value to transform the group to fit the new sizes
      const newScale = Math.min(newWidth / bbox.width, newHeight / bbox.height);
      // get the new translation to center the group
      const newTranslation = {
        x: (width - newWidth) / 2 / newScale - bbox.x,
        y: (height - newHeight) / 2 / newScale - bbox.y,
      };

      const scaleString = `scale(${newScale.toString()})`;
      const translationString = `translate(${newTranslation.x.toString()} ${newTranslation.y.toString()})`;
      const transform = `${scaleString} ${translationString}`;
      transformSpring.set(transform);
    }, 10);
  }, [width, height, children, transformSpring]);

  return (
    <>
      <defs>
        <animated.g ref={rootRef} id="untransformed">
          {children}
        </animated.g>
      </defs>
      <animated.g transform={transformSpring}>
        <use href="#untransformed" />
      </animated.g>
    </>
  );
}

export const Resizer = memo(InnerResizer);
