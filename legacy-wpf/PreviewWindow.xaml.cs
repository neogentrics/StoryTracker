using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;

namespace StoryTracker
{
    public partial class PreviewWindow : Window
    {
        public PreviewWindow(FlowDocument document, string chapterTitle)
        {
            InitializeComponent();
            ChapterTitleLabel.Text = chapterTitle;
            // Create a copy of the document to display
            var textRange = new TextRange(document.ContentStart, document.ContentEnd);
            var memoryStream = new System.IO.MemoryStream();
            textRange.Save(memoryStream, DataFormats.XamlPackage);
            var newDocument = new FlowDocument();
            var newRange = new TextRange(newDocument.ContentStart, newDocument.ContentEnd);
            newRange.Load(memoryStream, DataFormats.XamlPackage);

            PreviewViewer.Document = newDocument;
        }

        private void PrintButton_Click(object sender, RoutedEventArgs e)
        {
            var printDialog = new PrintDialog();
            if (printDialog.ShowDialog() == true)
            {
                printDialog.PrintDocument(((IDocumentPaginatorSource)PreviewViewer.Document).DocumentPaginator, "Printing Chapter...");
            }
        }
    }
}