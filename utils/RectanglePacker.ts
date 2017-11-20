import IntegerRectangle from './IntegerRectangle'
import SortableSize from './SortableSize';
import Rectangle from './Rectangle';

class RectanglePacker {
    public static VERSION: String = "1.3.0";

    private mWidth: number = 0;
    private mHeight: number = 0;
    private mPadding: number = 8;

    private mPackedWidth: number = 0;
    private mPackedHeight: number = 0;

    private mInsertList: Array<any> = [];

    private mInsertedRectangles: Array<IntegerRectangle> = new Array<IntegerRectangle>();
    private mFreeAreas: Array<IntegerRectangle> = new Array<IntegerRectangle>();
    private mNewFreeAreas: Array<IntegerRectangle> = new Array<IntegerRectangle>();

    private mOutsideRectangle: IntegerRectangle;

    private mSortableSizeStack: Array<SortableSize> = new Array<SortableSize>();
    private mRectangleStack: Array<IntegerRectangle> = new Array<IntegerRectangle>();

    public get rectangleCount(): number { return this.mInsertedRectangles.length; }

    public get packedWidth(): number { return this.mPackedWidth; }
    public get packedHeight(): number { return this.mPackedHeight; }

    public get padding(): number { return this.mPadding; }

    /**
     * Constructs new rectangle packer
     * @param width the width of the main rectangle
     * @param height the height of the main rectangle
     */
    public constructor(width: number, height: number, padding: number = 0) {
        this.mOutsideRectangle = new IntegerRectangle(width + 1, height + 1, 0, 0);
        this.reset(width, height, padding);
    }

    /**
     * Resets the rectangle packer with given dimensions
     * @param width
     * @param height
     */
    public reset(width: number, height: number, padding: number = 0): void {
        while (this.mInsertedRectangles.length) {
            this.freeRectangle(this.mInsertedRectangles.pop());
        }

        while (this.mFreeAreas.length) {
            this.freeRectangle(this.mFreeAreas.pop());
        }

        this.mWidth = width;
        this.mHeight = height;

        this.mPackedWidth = 0;
        this.mPackedHeight = 0;

        this.mFreeAreas[0] = this.allocateRectangle(0, 0, this.mWidth, this.mHeight);

        while (this.mInsertList.length) {
            this.freeSize(this.mInsertList.pop());
        }

        this.mPadding = padding;
    }

    /**
     * Gets the position of the rectangle in given index in the main rectangle
     * @param index the index of the rectangle
     * @param rectangle an instance where to set the rectangle's values
     * @return
     */
    public getRectangle(index: number, rectangle: Rectangle): Rectangle {
        var inserted: IntegerRectangle = this.mInsertedRectangles[index];
        if (rectangle) {
            rectangle.x = inserted.x;
            rectangle.y = inserted.y;
            rectangle.width = inserted.width;
            rectangle.height = inserted.height;
            return rectangle;
        }

        return new Rectangle(inserted.x, inserted.y, inserted.width, inserted.height);
    }

    /**
     * Gets the original id for the inserted rectangle in given index
     * @param index
     * @return
     */
    public getRectangleId(index: number): number {
        var inserted: IntegerRectangle = this.mInsertedRectangles[index];
        return inserted.id;
    }

    /**
     * Add a rectangle to be packed into the packer
     * @width the width of inserted rectangle
     * @height the height of inserted rectangle
     * @id the identifier for this rectangle
     * @return true if inserted successfully
     */
    public insertRectangle(width: number, height: number, id: number): void {
        var sortableSize: SortableSize = this.allocateSize(width, height, id);
        this.mInsertList.push(sortableSize);
    }

    /**
     * Packs the rectangles inserted
     * @param sort boolean defining whether to sort the inserted rectangles before packing
     * @return the number of the packed rectangles
     */
    public packRectangles(sort: Boolean = true): number {
        if (sort) {
            this.mInsertList.sort(function(a,b){
                return a.width - b.width;
            });
        }

        while (this.mInsertList.length > 0) {
            var sortableSize: SortableSize = this.mInsertList.pop() as SortableSize;
            var width: number = sortableSize.width;
            var height: number = sortableSize.height;

            var index: number = this.getFreeAreaIndex(width, height);
            if (index >= 0) {
                var freeArea: IntegerRectangle = this.mFreeAreas[index];
                var target: IntegerRectangle = this.allocateRectangle(freeArea.x, freeArea.y, width, height);
                target.id = sortableSize.id;

                // Generate the new free areas, these are parts of the old ones intersected or touched by the target
                this.generateNewFreeAreas(target, this.mFreeAreas, this.mNewFreeAreas);

                while (this.mNewFreeAreas.length > 0) {
                    this.mFreeAreas[this.mFreeAreas.length] = this.mNewFreeAreas.pop();
                }

                this.mInsertedRectangles[this.mInsertedRectangles.length] = target;
                if (target.right > this.mPackedWidth) {
                    this.mPackedWidth = target.right;
                }
                if (target.bottom > this.mPackedHeight) {
                    this.mPackedHeight = target.bottom;
                }
            }

            this.freeSize(sortableSize);
        }

        return this.rectangleCount;
    }

    /**
     * Removes rectangles from the filteredAreas that are sub rectangles of any rectangle in areas.
     * @param areas rectangles from which the filtering is performed
     */
    private filterSelfSubAreas(areas: Array<IntegerRectangle>): void {
        for (var i: number = areas.length - 1; i >= 0; i--) {
            var filtered: IntegerRectangle = areas[i];
            for (var j: number = areas.length - 1; j >= 0; j--) {
                if (i != j) {
                    var area: IntegerRectangle = areas[j];
                    if (filtered.x >= area.x && filtered.y >= area.y &&
                        filtered.right <= area.right && filtered.bottom <= area.bottom) {
                        this.freeRectangle(filtered);
                        var topOfStack: IntegerRectangle = areas.pop();
                        if (i < areas.length) {
                            // Move the one on the top to the freed position
                            areas[i] = topOfStack;
                        }
                        break;
                    }
                }
            }
        }
    }

    /**
     * Checks what areas the given rectangle intersects, removes those areas and
     * returns the list of new areas those areas are divided into
     * @param target the new rectangle that is dividing the areas
     * @param areas the areas to be divided
     * @return list of new areas
     */
    private generateNewFreeAreas(target: IntegerRectangle, areas: Array<IntegerRectangle>, results: Array<IntegerRectangle>): void {
        // Increase dimensions by one to get the areas on right / bottom this rectangle touches
        // Also add the padding here
        const x: number = target.x;
        const y: number = target.y;
        const right: number = target.right + 1 + this.mPadding;
        const bottom: number = target.bottom + 1 + this.mPadding;

        var targetWithPadding: IntegerRectangle = null;
        if (this.mPadding == 0) {
            targetWithPadding = target;
        }

        for (var i: number = areas.length - 1; i >= 0; i--) {
            const area: IntegerRectangle = areas[i];
            if (!(x >= area.right || right <= area.x || y >= area.bottom || bottom <= area.y)) {
                if (!targetWithPadding) {
                    targetWithPadding = this.allocateRectangle(target.x, target.y, target.width + this.mPadding, target.height + this.mPadding);
                }

                this.generateDividedAreas(targetWithPadding, area, results);
                var topOfStack: IntegerRectangle = areas.pop();
                if (i < areas.length) {
                    // Move the one on the top to the freed position
                    areas[i] = topOfStack;
                }
            }
        }

        if (targetWithPadding && targetWithPadding != target) {
            this.freeRectangle(targetWithPadding);
        }

        this.filterSelfSubAreas(results);
    }

    /**
     * Divides the area into new sub areas around the divider.
     * @param divider rectangle that intersects the area
     * @param area rectangle to be divided into sub areas around the divider
     * @param results vector for the new sub areas around the divider
     */
    private generateDividedAreas(divider: IntegerRectangle, area: IntegerRectangle, results: Array<IntegerRectangle>): void {
        var count: number = 0;
        const rightDelta: number = area.right - divider.right;
        if (rightDelta > 0) {
            results[results.length] = this.allocateRectangle(divider.right, area.y, rightDelta, area.height);
            count++;
        }

        const leftDelta: number = divider.x - area.x;
        if (leftDelta > 0) {
            results[results.length] = this.allocateRectangle(area.x, area.y, leftDelta, area.height);
            count++;
        }

        const bottomDelta: number = area.bottom - divider.bottom;
        if (bottomDelta > 0) {
            results[results.length] = this.allocateRectangle(area.x, divider.bottom, area.width, bottomDelta);
            count++;
        }

        const topDelta: number = divider.y - area.y;
        if (topDelta > 0) {
            results[results.length] = this.allocateRectangle(area.x, area.y, area.width, topDelta);
            count++;
        }

        if (count == 0 && (divider.width < area.width || divider.height < area.height)) {
            // Only touching the area, store the area itself
            results[results.length] = area;
        }
        else {
            this.freeRectangle(area);
        }
    }

    /**
     * Gets the index of the best free area for the given rectangle
     * @width the width of inserted rectangle
     * @height the height of inserted rectangle
     * @return index of the best free area or -1 if no suitable free area available
     */
    private getFreeAreaIndex(width: number, height: number): number {
        var best: IntegerRectangle = this.mOutsideRectangle;
        var index: number = -1;

        const paddedWidth: number = width + this.mPadding;
        const paddedHeight: number = height + this.mPadding;

        const count: number = this.mFreeAreas.length;
        for (var i: number = count - 1; i >= 0; i--) {
            const free: IntegerRectangle = this.mFreeAreas[i];
            if (free.x < this.mPackedWidth || free.y < this.mPackedHeight) {
                // Within the packed area, padding required
                if (free.x < best.x && paddedWidth <= free.width && paddedHeight <= free.height) {
                    index = i;
                    if ((paddedWidth == free.width && free.width <= free.height && free.right < this.mWidth) ||
                        (paddedHeight == free.height && free.height <= free.width)) {
                        break;
                    }
                    best = free;
                }
            }
            else {
                // Outside the current packed area, no padding required
                if (free.x < best.x && width <= free.width && height <= free.height) {
                    index = i;
                    if ((width == free.width && free.width <= free.height && free.right < this.mWidth) ||
                        (height == free.height && free.height <= free.width)) {
                        break;
                    }
                    best = free;
                }
            }
        }

        return index;
    }

    /**
     * Allocates new rectangle. If one available in stack uses that, otherwise new.
     * @param x
     * @param y
     * @param width
     * @param height
     * @return
     */
    private allocateRectangle(x: number, y: number, width: number, height: number): IntegerRectangle {
        if (this.mRectangleStack.length > 0) {
            var rectangle: IntegerRectangle = this.mRectangleStack.pop();
            rectangle.x = x;
            rectangle.y = y;
            rectangle.width = width;
            rectangle.height = height;
            rectangle.right = x + width;
            rectangle.bottom = y + height;

            return rectangle;
        }

        return new IntegerRectangle(x, y, width, height);
    }

    /**
     * Pushes the freed rectangle to rectangle stack. Make sure not to push same rectangle twice!
     * @param rectangle
     */
    private freeRectangle(rectangle: IntegerRectangle): void {
        this.mRectangleStack[this.mRectangleStack.length] = rectangle;
    }

    /**
     * Allocates new sortable size instance. If one available in stack uses that, otherwise new.
     * @param width
     * @param height
     * @param id
     * @return
     */
    private allocateSize(width: number, height: number, id: number): SortableSize {
        if (this.mSortableSizeStack.length > 0) {
            var size: SortableSize = this.mSortableSizeStack.pop();
            size.width = width;
            size.height = height;
            size.id = id;

            return size;
        }

        return new SortableSize(width, height, id);
    }

    /**
     * Pushes the freed sortable size to size stack. Make sure not to push same size twice!
     * @param size
     */
    private freeSize(size: SortableSize): void {
        this.mSortableSizeStack[this.mSortableSizeStack.length] = size;
    }
}