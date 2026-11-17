// Holding something by its grip and dropping it somewhere else in the same
// list: a course's lessons, the courses on the shelf. The grip is what is
// dragged (the whole row or card is shown under the pointer), a line shows
// where it will land, and one drop saves the new order.
import { useRef, useState, type DragEvent } from "react";
import { orderAfterDrop } from "../../../../shared/communityClassroom";

export function useDragOrder(ids: string[], onOrder: (ids: string[]) => void, axis: "x" | "y") {
  const [dragging, setDragging] = useState<string | null>(null);
  // The id it would land before; null is the end; undefined is nowhere yet.
  const [before, setBefore] = useState<string | null | undefined>(undefined);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  // What is held, kept outside the render too: a drop can arrive before the
  // next draw, and must not read what was true a moment earlier.
  const heldRef = useRef<string | null>(null);
  const end = () => { heldRef.current = null; setDragging(null); setBefore(undefined); };
  // Where it would land: before this item, or past its middle, before the next.
  const landing = (event: DragEvent<HTMLElement>, id: string): string | null => {
    const box = event.currentTarget.getBoundingClientRect();
    const past = axis === "y" ? event.clientY > box.top + box.height / 2 : event.clientX > box.left + box.width / 2;
    const list = idsRef.current;
    return past ? list[list.indexOf(id) + 1] ?? null : id;
  };
  return {
    dragging,
    before: dragging ? before : undefined,
    grip: (id: string) => ({
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
        const whole = event.currentTarget.closest("[data-drag-item]");
        if (whole) event.dataTransfer.setDragImage(whole, 24, 18);
        heldRef.current = id;
        setDragging(id);
      },
      onDragEnd: end,
    }),
    item: (id: string) => ({
      "data-drag-item": id,
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!heldRef.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const next = landing(event, id);
        setBefore((current) => (current === next ? current : next));
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        const held = heldRef.current;
        if (!held) return;
        event.preventDefault();
        const next = orderAfterDrop(idsRef.current, held, landing(event, id));
        end();
        if (next) onOrder(next);
      },
    }),
  };
}
