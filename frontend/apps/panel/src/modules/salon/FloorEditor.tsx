import { Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Table } from '@pizzalog/shared';

const W = 960;
const H = 600;
const GRID = 40;
const SNAP = 10;

const snap = (v: number) => Math.round(v / SNAP) * SNAP;

interface Props {
  tables: Table[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onMove: (id: number, x: number, y: number) => void;
}

export function FloorEditor({ tables, selectedId, onSelect, onMove }: Props) {
  const gridLines = [];
  for (let x = GRID; x < W; x += GRID) {
    gridLines.push(<Line key={`v${x}`} points={[x, 0, x, H]} stroke="#332f30" strokeWidth={1} />);
  }
  for (let y = GRID; y < H; y += GRID) {
    gridLines.push(<Line key={`h${y}`} points={[0, y, W, y]} stroke="#332f30" strokeWidth={1} />);
  }

  return (
    <div className="floor-canvas">
      <Stage width={W} height={H}>
        <Layer listening={false}>{gridLines}</Layer>
        <Layer>
          {tables.map((t) => {
            const selected = t.id === selectedId;
            const isRound = t.shape === 'round';
            return (
              <Group
                key={t.id}
                x={t.pos_x}
                y={t.pos_y}
                draggable
                onClick={() => onSelect(t.id)}
                onTap={() => onSelect(t.id)}
                onDragEnd={(e: KonvaEventObject<DragEvent>) =>
                  onMove(t.id, snap(e.target.x()), snap(e.target.y()))
                }
              >
                <Rect
                  width={t.width}
                  height={t.height}
                  cornerRadius={isRound ? Math.min(t.width, t.height) / 2 : 8}
                  fill={selected ? '#fdb740' : t.kind === 'bar' ? '#58a6cf' : '#f0e6d0'}
                  stroke={selected ? '#d73828' : '#231f20'}
                  strokeWidth={selected ? 3 : 1.5}
                  shadowColor="#000"
                  shadowBlur={selected ? 12 : 4}
                  shadowOpacity={0.3}
                />
                <Text
                  width={t.width}
                  height={t.height}
                  text={t.label}
                  align="center"
                  verticalAlign="middle"
                  fontSize={15}
                  fontStyle="bold"
                  fill="#231f20"
                  listening={false}
                />
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
