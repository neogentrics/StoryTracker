using System.Windows;

namespace StoryTracker
{
    public partial class InputDialog : Window
    {
        public string Answer { get; private set; } = "";

        public InputDialog(string question)
        {
            InitializeComponent();
            QuestionLabel.Text = question;
        }

        private void OKButton_Click(object sender, RoutedEventArgs e)
        {
            Answer = AnswerTextBox.Text;
            DialogResult = true;
        }
    }
}