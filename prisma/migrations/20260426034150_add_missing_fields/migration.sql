-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "description" TEXT,
ADD COLUMN     "primary_color" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "image_url" TEXT;
