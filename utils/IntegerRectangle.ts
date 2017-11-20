export default class numberegerRectangle {
    public x: number;
    public y: number;
    public width: number;
    public height: number;
    public right: number;
    public bottom: number;
    public id: number;

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.right = x + width;
        this.bottom = y + height;
    }
}