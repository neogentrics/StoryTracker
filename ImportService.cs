using iTextSharp.text.pdf;
using iTextSharp.text.pdf.parser;
using System.Reflection.PortableExecutable;
using System.Text;
using Xceed.Words.NET;

namespace StoryTracker.MAUI
{
    public class ImportService
    {
        public async Task<(string FileName, string Content)> ImportFile(PickOptions options)
        {
            var result = await FilePicker.Default.PickAsync(options);
            if (result != null)
            {
                string content;
                string extension = System.IO.Path.GetExtension(result.FileName).ToLower();

                switch (extension)
                {
                    case ".docx":
                        content = await ReadDocx(result);
                        break;
                    case ".pdf":
                        content = await ReadPdf(result);
                        break;
                    case ".txt":
                    case ".rtf":
                    case ".html":
                    default:
                        content = await ReadPlainText(result);
                        break;
                }
                return (System.IO.Path.GetFileNameWithoutExtension(result.FileName), content);
            }
            return (null, null);
        }

        private async Task<string> ReadPlainText(FileResult file)
        {
            using var stream = await file.OpenReadAsync();
            using var reader = new StreamReader(stream);
            return await reader.ReadToEndAsync();
        }

        private async Task<string> ReadDocx(FileResult file)
        {
            using var stream = await file.OpenReadAsync();
            using (var doc = DocX.Load(stream))
            {
                return doc.Text;
            }
        }

        private async Task<string> ReadPdf(FileResult file)
        {
            using var stream = await file.OpenReadAsync();
            var sb = new StringBuilder();
            using (var reader = new PdfReader(stream))
            {
                for (int page = 1; page <= reader.NumberOfPages; page++)
                {
                    sb.Append(PdfTextExtractor.GetTextFromPage(reader, page));
                }
            }
            return sb.ToString();
        }
    }
}