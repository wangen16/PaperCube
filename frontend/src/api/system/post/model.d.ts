/**
 * @description: Post interface
 */
export interface Post {
  postId: number;
  deptId: number | null;
  deptName: string;
  postCode: string;
  postName: string;
  postSort: number;
  status: string;
  remark: string;
  createTime: string;
}
